"use strict";

/**
 * Football Live - Core Services, Storage & Cloud Sync Bridge for My PC Smart TV
 *
 * Persists user favorites & tracked matches across:
 * 1. MyPC.save('appConfig', cfg) & MyPC.load('appConfig', null) (per My PC profile)
 * 2. LocalStorage fallback for instant startup
 * 3. Per-user Firebase Firestore document (usersSettings/{uid})
 * 4. Shared MyPC Widget/Service Firestore REST Bridge (usersSettings/34n9lRAx7uUMeDQ3KW32H07qJhz1)
 *    so sandboxed data: Web Workers (widgets/scores.js & services/notify.js) always read live saved favorites.
 */

const firebaseConfig = {
    apiKey: "AIzaSyClgzoMBEKizx-r7abMvAmLgGpk_p748IU",
    authDomain: "iptv-8b60c.firebaseapp.com",
    projectId: "iptv-8b60c",
    storageBucket: "iptv-8b60c.firebasestorage.app",
    messagingSenderId: "259048691910",
    appId: "1:259048691910:web:b57f9eeda5546ce4d8dfc7"
};

const BRIDGE_CREDENTIALS = {
    email: "mypc_bridge@mypc.football",
    password: "MyPC_bridge_football2024!",
    uid: "34n9lRAx7uUMeDQ3KW32H07qJhz1"
};

const POPULAR_TEAMS = [
    { id: 541, name: "Real Madrid", country: "Spain", logo: "https://media.api-sports.io/football/teams/541.png" },
    { id: 529, name: "Barcelona", country: "Spain", logo: "https://media.api-sports.io/football/teams/529.png" },
    { id: 489, name: "AC Milan", country: "Italy", logo: "https://media.api-sports.io/football/teams/489.png" },
    { id: 50, name: "Manchester City", country: "England", logo: "https://media.api-sports.io/football/teams/50.png" },
    { id: 85, name: "Paris Saint Germain", country: "France", logo: "https://media.api-sports.io/football/teams/85.png" },
    { id: 40, name: "Liverpool", country: "England", logo: "https://media.api-sports.io/football/teams/40.png" },
    { id: 42, name: "Arsenal", country: "England", logo: "https://media.api-sports.io/football/teams/42.png" },
    { id: 157, name: "Bayern Munich", country: "Germany", logo: "https://media.api-sports.io/football/teams/157.png" },
    { id: 505, name: "Inter", country: "Italy", logo: "https://media.api-sports.io/football/teams/505.png" },
    { id: 496, name: "Juventus", country: "Italy", logo: "https://media.api-sports.io/football/teams/496.png" },
    { id: 33, name: "Manchester United", country: "England", logo: "https://media.api-sports.io/football/teams/33.png" },
    { id: 49, name: "Chelsea", country: "England", logo: "https://media.api-sports.io/football/teams/49.png" },
    { id: 530, name: "Atletico Madrid", country: "Spain", logo: "https://media.api-sports.io/football/teams/530.png" },
    { id: 165, name: "Borussia Dortmund", country: "Germany", logo: "https://media.api-sports.io/football/teams/165.png" },
    { id: 31, name: "Morocco", country: "Morocco", logo: "https://media.api-sports.io/football/teams/31.png" },
    { id: 968, name: "Wydad AC", country: "Morocco", logo: "https://media.api-sports.io/football/teams/968.png" },
    { id: 976, name: "Raja Casablanca", country: "Morocco", logo: "https://media.api-sports.io/football/teams/976.png" }
];

const POPULAR_LEAGUES = [
    { id: 2, name: "UEFA Champions League", country: "World", logo: "https://media.api-sports.io/football/leagues/2.png" },
    { id: 39, name: "Premier League", country: "England", logo: "https://media.api-sports.io/football/leagues/39.png" },
    { id: 140, name: "La Liga", country: "Spain", logo: "https://media.api-sports.io/football/leagues/140.png" },
    { id: 135, name: "Serie A", country: "Italy", logo: "https://media.api-sports.io/football/leagues/135.png" },
    { id: 78, name: "Bundesliga", country: "Germany", logo: "https://media.api-sports.io/football/leagues/78.png" },
    { id: 61, name: "Ligue 1", country: "France", logo: "https://media.api-sports.io/football/leagues/61.png" },
    { id: 3, name: "UEFA Europa League", country: "World", logo: "https://media.api-sports.io/football/leagues/3.png" },
    { id: 200, name: "Botola Pro", country: "Morocco", logo: "https://media.api-sports.io/football/leagues/200.png" }
];

const State = {
    currentUser: { name: "Player", email: "player@mypc.football", uid: "local_player" },
    appConfig: {
        favorite_teams: [
            { id: 85, name: "Paris Saint Germain", logo: "https://media.api-sports.io/football/teams/85.png" },
            { id: 50, name: "Manchester City", logo: "https://media.api-sports.io/football/teams/50.png" },
            { id: 541, name: "Real Madrid", logo: "https://media.api-sports.io/football/teams/541.png" },
            { id: 529, name: "Barcelona", logo: "https://media.api-sports.io/football/teams/529.png" },
            { id: 489, name: "AC Milan", logo: "https://media.api-sports.io/football/teams/489.png" },
            { id: 31, name: "Morocco", logo: "https://media.api-sports.io/football/teams/31.png" }
        ],
        favorite_leagues: [
            { id: 2, name: "UEFA Champions League", logo: "https://media.api-sports.io/football/leagues/2.png" },
            { id: 39, name: "Premier League", logo: "https://media.api-sports.io/football/leagues/39.png" },
            { id: 140, name: "La Liga", logo: "https://media.api-sports.io/football/leagues/140.png" },
            { id: 135, name: "Serie A", logo: "https://media.api-sports.io/football/leagues/135.png" }
        ],
        favorite_players: [],
        tracked_matches: [],
        apiSource: 'wrapped',
        buttonMappings: {
            dateNext: 'pageUp',
            datePrev: 'pageDown',
            favToggle: 'y',
            trackToggle: 'run'
        },
        widgetSettings: {
            mode: 'both',
            sources: {
                tracked_matches: true,
                favorite_teams: true,
                favorite_leagues: false,
                allowed_leagues: false
            },
            priority: ['tracked_matches', 'favorite_teams', 'favorite_leagues', 'allowed_leagues']
        },
        serviceSettings: {
            mode: 'both',
            sources: {
                tracked_matches: true,
                favorite_teams: true,
                favorite_leagues: false,
                allowed_leagues: false
            },
            priority: ['tracked_matches', 'favorite_teams', 'favorite_leagues', 'allowed_leagues']
        }
    },
    globalSettings: {
        allowed_leagues: [
            { id: 2, name: "UEFA Champions League" },
            { id: 39, name: "Premier League" },
            { id: 140, name: "La Liga" },
            { id: 135, name: "Serie A" },
            { id: 78, name: "Bundesliga" },
            { id: 61, name: "Ligue 1" },
            { id: 3, name: "UEFA Europa League" }
        ]
    },
    firebaseConnected: false,
    bridgeSynced: false,
    POPULAR_TEAMS,
    POPULAR_LEAGUES
};

const Helpers = {
    formatDate: (date) => {
        if (!(date instanceof Date) || isNaN(date)) date = new Date();
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },
    formatDisplayDate: (date) => {
        if (!(date instanceof Date) || isNaN(date)) date = new Date();
        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();
        const tmr = new Date(today); tmr.setDate(today.getDate() + 1);
        const yest = new Date(today); yest.setDate(today.getDate() - 1);
        const shortStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (isToday) return `Today · ${shortStr}`;
        if (date.toDateString() === tmr.toDateString()) return `Tomorrow · ${shortStr}`;
        if (date.toDateString() === yest.toDateString()) return `Yesterday · ${shortStr}`;
        return shortStr;
    },
    getCurrentSeason: () => {
        const today = new Date();
        return (today.getMonth() < 6) ? today.getFullYear() - 1 : today.getFullYear();
    },
    isFav: (type, id) => {
        try {
            if (window.AppServices && window.AppServices.FavoritesService) {
                return window.AppServices.FavoritesService.isFavorite(type, id);
            }
        } catch (e) {}
        const idNum = Number(id);
        const { appConfig } = State;
        if (type === 'team') return Boolean(appConfig.favorite_teams && appConfig.favorite_teams.some(team => Number(team.id) === idNum));
        if (type === 'league') return Boolean(appConfig.favorite_leagues && appConfig.favorite_leagues.some(league => Number(league.id) === idNum));
        if (type === 'player') return Boolean(appConfig.favorite_players && appConfig.favorite_players.some(p => Number(p.id) === idNum));
        return false;
    },
    showToast: (message, type = 'info') => {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;

        let icon = 'ph-info';
        if (type === 'error') icon = 'ph-warning-circle';
        if (type === 'success') icon = 'ph-check-circle';
        if (type === 'alert') icon = 'ph-bell-ringing';

        toast.innerHTML = `<i class="ph ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        if (typeof MyPC !== 'undefined' && typeof MyPC.announce === 'function') {
            try { MyPC.announce(message); } catch (e) {}
        }

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-8px)';
            setTimeout(() => toast.remove(), 220);
        }, 3200);
    },
    showPageError: (message) => {
        const container = document.getElementById('content-container');
        if (!container) return;

        container.innerHTML = `
            <div class="page-error">
                <i class="ph ph-warning-octagon"></i>
                <h2>Unable to Load Match Data</h2>
                <p>${message}</p>
                <button class="styled-button focusable" tabindex="0" onclick="window.AppRouter.go('home')">Retry</button>
            </div>
        `;
        const btn = container.querySelector('button');
        if (btn && window.Navigation) window.Navigation.focus(btn);
    }
};

const API = {
    fetch: async (endpointUrl) => {
        const [path, queryString] = endpointUrl.split('?');
        let data = null;
        const params = {};
        if (queryString) {
            new URLSearchParams(queryString).forEach((value, key) => {
                params[key] = value;
            });
        }
        try {
            if (window.FootballClient) {
                data = await window.FootballClient.fetchData(path, params);
            }
            API.lastErrors = null;
            if (data && data.errors && Object.keys(data.errors).length > 0) {
                API.lastErrors = data.errors;
                console.warn("API returned partial errors:", data.errors);
            }
            return (data && data.response) ? data.response : [];
        } catch (error) {
            console.error("API Error detected in fetch:", error);
            const container = document.getElementById('content-container');
            const isLoading = container && (container.querySelector('.skeleton-row') || container.querySelector('.skeleton-detail-header'));
            const errorMessages = error.message || "Failed to load football data.";
            if (isLoading) {
                Helpers.showPageError(errorMessages);
            } else if (API.lastToast !== errorMessages || Date.now() - (API.lastToastAt || 0) > 60000) {
                // Background refreshes repeat the same error: show it once a minute at most.
                API.lastToast = errorMessages;
                API.lastToastAt = Date.now();
                Helpers.showToast(errorMessages, 'error');
            }
            return null;
        }
    }
};

const FavoritesService = {
    normalizeConfig: (cfg) => {
        const c = cfg ? { ...cfg } : {};
        const toArr = (v) => Array.isArray(v) ? v : [];
        const mergeUniqueById = (a, b) => {
            const out = [];
            const seen = new Set();
            [...toArr(a), ...toArr(b)].forEach(it => {
                let id = Number(it && it.id);
                const name = String((it && it.name) || 'Unknown').trim();
                let logo = it && it.logo;
                if (id === 23 && name.toLowerCase() === 'morocco') {
                    id = 31;
                    logo = 'https://media.api-sports.io/football/teams/31.png';
                }
                if (!id || seen.has(id)) return;
                seen.add(id);
                logo = logo || (id ? `https://media.api-sports.io/football/teams/${id}.png` : '');
                out.push({ ...it, id, name, logo });
            });
            return out;
        };

        c.favorite_teams = mergeUniqueById(c.favorite_teams, c.favourit_teams);
        c.favorite_leagues = mergeUniqueById(c.favorite_leagues, c.favourite_leagues);
        c.favorite_players = mergeUniqueById(c.favorite_players, c.favourite_players);
        c.tracked_matches = Array.from(new Set(toArr(c.tracked_matches).map(Number).filter(Boolean)));

        delete c.favourit_teams;
        delete c.favourite_leagues;
        delete c.favourite_players;

        c.buttonMappings = Object.assign({
            dateNext: 'pageUp',
            datePrev: 'pageDown',
            favToggle: 'y',
            trackToggle: 'run'
        }, c.buttonMappings || {});

        const DEFAULT_PRIORITY = ['tracked_matches', 'favorite_teams', 'favorite_leagues', 'allowed_leagues'];
        const normalizePriority = (arr) => {
            const valid = Array.isArray(arr) ? arr.filter(k => DEFAULT_PRIORITY.includes(k)) : [];
            DEFAULT_PRIORITY.forEach(k => {
                if (!valid.includes(k)) valid.push(k);
            });
            return valid;
        };

        const normalizeSourceBlock = (raw) => {
            const block = raw && typeof raw === 'object' ? { ...raw } : {};
            const mode = ['fav_teams_only', 'tracked_only', 'both', 'all', 'custom'].includes(block.mode)
                ? block.mode
                : 'both';
            const defaultSources = {
                tracked_matches: mode !== 'fav_teams_only',
                favorite_teams: mode !== 'tracked_only',
                favorite_leagues: mode === 'all',
                allowed_leagues: mode === 'all'
            };
            const sources = Object.assign({}, defaultSources, block.sources || {});
            if (mode === 'fav_teams_only') {
                sources.tracked_matches = false;
                sources.favorite_teams = true;
                sources.favorite_leagues = false;
                sources.allowed_leagues = false;
            } else if (mode === 'tracked_only') {
                sources.tracked_matches = true;
                sources.favorite_teams = false;
                sources.favorite_leagues = false;
                sources.allowed_leagues = false;
            } else if (mode === 'both') {
                sources.tracked_matches = true;
                sources.favorite_teams = true;
                sources.favorite_leagues = false;
                sources.allowed_leagues = false;
            } else if (mode === 'all') {
                sources.tracked_matches = true;
                sources.favorite_teams = true;
                sources.favorite_leagues = true;
                sources.allowed_leagues = true;
            }
            return {
                mode,
                sources: {
                    tracked_matches: Boolean(sources.tracked_matches),
                    favorite_teams: Boolean(sources.favorite_teams),
                    favorite_leagues: Boolean(sources.favorite_leagues),
                    allowed_leagues: Boolean(sources.allowed_leagues)
                },
                priority: normalizePriority(block.priority)
            };
        };

        c.widgetSettings = normalizeSourceBlock(c.widgetSettings);
        c.serviceSettings = normalizeSourceBlock(c.serviceSettings);
        // Football data source: 'wrapped' = our Firebase function (default), 'direct' = API-Football.
        c.apiSource = c.apiSource === 'direct' ? 'direct' : 'wrapped';

        if (!Array.isArray(c.allowed_leagues) || c.allowed_leagues.length === 0) {
            c.allowed_leagues = (State.globalSettings && Array.isArray(State.globalSettings.allowed_leagues))
                ? State.globalSettings.allowed_leagues
                : [];
        }

        return c;
    },

    ensure: () => {
        State.appConfig = FavoritesService.normalizeConfig(State.appConfig || {});
        return State.appConfig;
    },

    _keyForType: (type) => ({ team: 'favorite_teams', league: 'favorite_leagues', player: 'favorite_players' }[type] || 'favorite_teams'),

    list: (type) => {
        const cfg = FavoritesService.ensure();
        return cfg[FavoritesService._keyForType(type)] || [];
    },

    isFavorite: (type, id) => {
        const idNum = Number(id);
        if (!idNum) return false;
        const arr = FavoritesService.list(type);
        return arr.some(x => Number(x.id) === idNum);
    },

    add: async (type, item) => {
        const id = Number(item && item.id);
        if (!id) return false;
        const cfg = FavoritesService.ensure();
        const key = FavoritesService._keyForType(type);
        const arr = cfg[key] || [];
        if (arr.some(x => Number(x.id) === id)) return false;
        const defaultLogo = type === 'team'
            ? `https://media.api-sports.io/football/teams/${id}.png`
            : (type === 'league' ? `https://media.api-sports.io/football/leagues/${id}.png` : '');
        arr.push({
            ...item,
            id,
            name: String(item.name || 'Unknown').trim(),
            logo: item.logo || defaultLogo
        });
        cfg[key] = arr;
        State.appConfig = cfg;
        await Storage.saveUserConfig(State.currentUser.uid, cfg);
        return true;
    },

    remove: async (type, id) => {
        const idNum = Number(id);
        if (!idNum) return false;
        const cfg = FavoritesService.ensure();
        const key = FavoritesService._keyForType(type);
        cfg[key] = (cfg[key] || []).filter(x => Number(x.id) !== idNum);
        State.appConfig = cfg;
        await Storage.saveUserConfig(State.currentUser.uid, cfg);
        return true;
    },

    toggle: async (type, item) => {
        const id = Number(item && item.id);
        if (!id) return { active: false, changed: false };
        if (FavoritesService.isFavorite(type, id)) {
            const ok = await FavoritesService.remove(type, id);
            return { active: false, changed: ok };
        }
        const ok = await FavoritesService.add(type, item);
        return { active: true, changed: ok };
    }
};

let firebaseDb = null;
let firebaseAuth = null;
let bridgeTokenCache = { token: null, exp: 0 };

async function getBridgeAuthToken() {
    const now = Date.now();
    if (bridgeTokenCache.token && bridgeTokenCache.exp > now) {
        return bridgeTokenCache.token;
    }
    try {
        const res = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: BRIDGE_CREDENTIALS.email,
                    password: BRIDGE_CREDENTIALS.password,
                    returnSecureToken: true
                })
            }
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.idToken) {
            bridgeTokenCache = {
                token: data.idToken,
                exp: now + 50 * 60 * 1000
            };
            return data.idToken;
        }
    } catch (e) {}
    return null;
}

const Storage = {
    saveUserConfigLocally: (config) => {
        const cfg = config || State.appConfig;
        try {
            localStorage.setItem('appConfig', JSON.stringify(cfg));
        } catch (e) {}
        try {
            if (typeof MyPC !== 'undefined' && typeof MyPC.save === 'function') {
                MyPC.save('appConfig', cfg);
                if (Array.isArray(cfg.tracked_matches)) {
                    MyPC.save('tracked_matches', cfg.tracked_matches);
                }
            }
        } catch (e) {}
    },

    loadUserConfigLocally: () => {
        // Priority 1: MyPC native profile storage (synchronous from onInit)
        try {
            if (typeof MyPC !== 'undefined' && typeof MyPC.load === 'function') {
                const mypcSaved = MyPC.load('appConfig', null);
                if (mypcSaved && typeof mypcSaved === 'object' && (Array.isArray(mypcSaved.favorite_teams) || Array.isArray(mypcSaved.favorite_leagues))) {
                    return mypcSaved;
                }
            }
        } catch (e) {}

        // Priority 2: LocalStorage
        try {
            const configStr = localStorage.getItem('appConfig');
            return configStr ? JSON.parse(configStr) : null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Push user's favorites & tracked matches to the shared Firestore REST Bridge
     * so sandboxed Web Workers (widgets/scores.js & services/notify.js) always have instant access.
     */
    syncToWidgetServiceBridge: async (config) => {
        const cfg = FavoritesService.normalizeConfig(config || State.appConfig);
        if (window.AppState && window.AppState.monitoredMatches) {
            cfg.tracked_matches = Array.from(window.AppState.monitoredMatches).map(Number).filter(Boolean);
        }
        const cleanUser = String(State.currentUser?.name || 'player').toLowerCase().replace(/[^a-z0-9_]/g, '') || 'player';
        const payloadObj = {
            username: cleanUser,
            updatedAt: Date.now(),
            favorite_teams: cfg.favorite_teams || [],
            favorite_leagues: cfg.favorite_leagues || [],
            favorite_players: cfg.favorite_players || [],
            tracked_matches: cfg.tracked_matches || [],
            allowed_leagues: cfg.allowed_leagues || State.globalSettings?.allowed_leagues || [],
            widgetSettings: cfg.widgetSettings,
            serviceSettings: cfg.serviceSettings,
            apiSource: cfg.apiSource
        };
        const payloadJson = JSON.stringify(payloadObj);

        try {
            const token = await getBridgeAuthToken();
            if (!token) return false;

            const docUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/usersSettings/${BRIDGE_CREDENTIALS.uid}`;

            // Read existing profiles map so we preserve other profiles on the same TV
            let existingProfiles = {};
            try {
                const getRes = await fetch(docUrl, { headers: { Authorization: `Bearer ${token}` } });
                if (getRes.ok) {
                    const existingDoc = await getRes.json();
                    if (existingDoc?.fields?.profiles?.mapValue?.fields) {
                        existingProfiles = { ...existingDoc.fields.profiles.mapValue.fields };
                    }
                }
            } catch (e) {}

            existingProfiles[cleanUser] = { stringValue: payloadJson };

            const patchBody = {
                fields: {
                    latestConfigJson: { stringValue: payloadJson },
                    widgetSettingsJson: { stringValue: JSON.stringify(cfg.widgetSettings || {}) },
                    serviceSettingsJson: { stringValue: JSON.stringify(cfg.serviceSettings || {}) },
                    lastUsername: { stringValue: cleanUser },
                    updatedAt: { integerValue: String(Date.now()) },
                    profiles: {
                        mapValue: {
                            fields: existingProfiles
                        }
                    }
                }
            };

            const patchRes = await fetch(docUrl, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(patchBody)
            });

            if (patchRes.ok) {
                State.bridgeSynced = true;
                return true;
            }
        } catch (e) {
            console.warn("Widget/Service bridge sync warning:", e);
        }
        return false;
    },

    loadFromWidgetServiceBridge: async (mypcUsername) => {
        try {
            const token = await getBridgeAuthToken();
            if (!token) return null;
            const docUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/usersSettings/${BRIDGE_CREDENTIALS.uid}`;
            const res = await fetch(docUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return null;
            const doc = await res.json();
            const fields = doc.fields || {};
            const cleanUser = String(mypcUsername || 'player').toLowerCase().replace(/[^a-z0-9_]/g, '') || 'player';

            if (fields.profiles?.mapValue?.fields?.[cleanUser]?.stringValue) {
                State.bridgeSynced = true;
                return JSON.parse(fields.profiles.mapValue.fields[cleanUser].stringValue);
            }
            if (fields.latestConfigJson?.stringValue) {
                State.bridgeSynced = true;
                return JSON.parse(fields.latestConfigJson.stringValue);
            }
        } catch (e) {}
        return null;
    },

    initSeamlessFirebase: async (mypcUsername) => {
        const username = mypcUsername || "Player";
        const cleanUser = username.toLowerCase().replace(/[^a-z0-9_]/g, '') || "player";

        if (typeof firebase !== 'undefined' && firebase.initializeApp) {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                firebaseAuth = firebase.auth();
                firebaseDb = firebase.firestore();

                const userCredential = await firebaseAuth.signInWithEmailAndPassword(
                    BRIDGE_CREDENTIALS.email,
                    BRIDGE_CREDENTIALS.password
                );

                if (userCredential && userCredential.user) {
                    const u = userCredential.user;
                    State.currentUser = { uid: u.uid, email: `${cleanUser}@mypc.football`, name: username };
                    State.firebaseConnected = true;

                    const doc = await firebaseDb.collection('usersSettings').doc(u.uid).get();
                    if (doc.exists) {
                        const data = doc.data() || {};
                        let remoteConfig = null;
                        if (data.profiles && typeof data.profiles[cleanUser] === 'string') {
                            try { remoteConfig = JSON.parse(data.profiles[cleanUser]); } catch (e) {}
                        } else if (typeof data.latestConfigJson === 'string') {
                            try { remoteConfig = JSON.parse(data.latestConfigJson); } catch (e) {}
                        } else if (Array.isArray(data.favorite_teams) || Array.isArray(data.favourit_teams)) {
                            remoteConfig = data;
                        }

                        if (remoteConfig && (Array.isArray(remoteConfig.favorite_teams) || Array.isArray(remoteConfig.favourit_teams))) {
                            // Merge with any local changes if local already exists
                            const local = Storage.loadUserConfigLocally();
                            const merged = local ? FavoritesService.normalizeConfig({
                                ...remoteConfig,
                                ...local,
                                favorite_teams: local.favorite_teams || remoteConfig.favorite_teams,
                                favorite_leagues: local.favorite_leagues || remoteConfig.favorite_leagues,
                                tracked_matches: local.tracked_matches || remoteConfig.tracked_matches,
                                allowed_leagues: local.allowed_leagues || remoteConfig.allowed_leagues,
                                widgetSettings: local.widgetSettings || remoteConfig.widgetSettings,
                                serviceSettings: local.serviceSettings || remoteConfig.serviceSettings
                            }) : FavoritesService.normalizeConfig(remoteConfig);
                            State.appConfig = merged;
                            Storage.saveUserConfigLocally(State.appConfig);
                            await Storage.syncToWidgetServiceBridge(State.appConfig);
                            return State.appConfig;
                        }
                    }
                    await Storage.syncToWidgetServiceBridge(State.appConfig);
                }
            } catch (fbErr) {
                console.warn("Seamless Firebase initialization fallback:", fbErr.message);
            }
        }
        return null;
    },

    loadUserConfig: async (mypcUsername) => {
        // 1. Check MyPC.load('appConfig', null) or localStorage first for immediate responsiveness
        const local = Storage.loadUserConfigLocally();
        if (local) {
            State.appConfig = FavoritesService.normalizeConfig(local);
        }

        // 2. Check per-profile Firebase Firestore
        const fbConfig = await Storage.initSeamlessFirebase(mypcUsername);
        if (fbConfig) {
            if (Array.isArray(fbConfig.tracked_matches) && window.AppState) {
                fbConfig.tracked_matches.forEach(id => window.AppState.monitoredMatches.add(Number(id)));
            }
            return fbConfig;
        }

        // 3. Check shared Widget/Service Bridge if no local config was saved yet
        if (!local) {
            const bridgeCfg = await Storage.loadFromWidgetServiceBridge(mypcUsername);
            if (bridgeCfg) {
                State.appConfig = FavoritesService.normalizeConfig(Object.assign({}, State.appConfig, bridgeCfg));
                Storage.saveUserConfigLocally(State.appConfig);
            }
        }

        // Ensure widget/service bridge always has the active config
        Storage.syncToWidgetServiceBridge(State.appConfig);
        return State.appConfig;
    },

    saveUserConfig: async (uid, config) => {
        if (config) State.appConfig = FavoritesService.normalizeConfig(config);
        if (window.AppState && window.AppState.monitoredMatches) {
            State.appConfig.tracked_matches = Array.from(window.AppState.monitoredMatches).map(Number).filter(Boolean);
        }

        // 1. Save to MyPC.save('appConfig', ...) & localStorage immediately
        Storage.saveUserConfigLocally(State.appConfig);

        // 2. Save to Widget & Service Firestore REST Bridge (non-blocking or awaited)
        const bridgePromise = Storage.syncToWidgetServiceBridge(State.appConfig);

        // 3. Save to user's personal Firebase document if connected
        if (firebaseDb && State.currentUser && State.currentUser.uid && State.currentUser.uid !== 'local_player') {
            try {
                await firebaseDb.collection('usersSettings').doc(State.currentUser.uid).set(State.appConfig, { merge: true });
            } catch (err) {
                console.warn("Firebase save warning:", err.message);
            }
        }

        await bridgePromise;
    },

    loadGlobalSettings: async () => {
        if (typeof MyPC !== 'undefined' && MyPC.app_config && Array.isArray(MyPC.app_config.allowed_leagues)) {
            State.globalSettings.allowed_leagues = MyPC.app_config.allowed_leagues;
        }
        return State.globalSettings;
    }
};

// Initial synchronous load
const cached = Storage.loadUserConfigLocally();
if (cached) {
    State.appConfig = FavoritesService.normalizeConfig(cached);
}

const auth = {
    get currentUser() { return State.currentUser; },
    onAuthStateChanged: function(cb) {
        if (typeof cb === 'function') {
            setTimeout(() => cb(State.currentUser), 30);
        }
    },
    signOut: async function() {
        Helpers.showToast("Profile is managed by My PC", "info");
    }
};

window.AppServices = { State, API, Storage, Helpers, FavoritesService, auth };