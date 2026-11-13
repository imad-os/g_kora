"use strict";

/**
 * Football Live - Core Services, Storage & Cloud Sync Bridge for My PC Smart TV
 *
 * Favorites, tracked matches and settings are saved in My PC's user data (MyPC.save, synced by My PC)
 * and in the shared Widget/Service bridge document (usersSettings/34n9lRAx7uUMeDQ3KW32H07qJhz1, Firestore REST)
 * that the sandboxed widget (widgets/scores.js) and alerts service (services/notify.js) read. See `Storage` below.
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
        // Football data source: 'wrapped' = our Cloudflare Worker (default), 'direct' = API-Football.
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

/*
 * Saving (1.4.0): ONE copy of the user's data = the app config object below, kept in
 *  - MyPC.save('appConfig')   per My PC profile; My PC backs it up and syncs it with the player account
 *                             (TV <-> PC <-> phone signed in to the same account)
 *  - the bridge document      usersSettings/<bridge uid>.profiles.<profile name> (read by the widget and the
 *                             alerts service, and a second way to reach other devices of the same profile name)
 * Every change made by the user stamps `changedAt`; when the copies differ the NEWEST one wins as a whole
 * (so a match untracked on the PC is untracked on the TV too). Copies written before 1.4.0 have no stamp:
 * their favorites and tracked matches are put together once, so nothing is lost.
 * No timer: the bridge is read at start and again on resume / when the app is shown, at most once a minute.
 */
const SYNC_LISTS = ['favorite_teams', 'favorite_leagues', 'favorite_players', 'tracked_matches'];
const BRIDGE_DOC = () => `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/usersSettings/${BRIDGE_CREDENTIALS.uid}`;
const cleanName = (n) => String(n || 'player').toLowerCase().replace(/[^a-z0-9_]/g, '') || 'player';
let lastPushed = '';
let lastBridgeRead = 0;
const changeListeners = [];

const Storage = {
    /** Called by the app whenever the data changed (re-render what is on screen). */
    onChange: (fn) => { if (typeof fn === 'function') changeListeners.push(fn); },

    /** Newest copy wins; copies without a stamp are put together (favorites + tracked matches). */
    mergeCopies: (copies) => {
        const list = copies.filter(c => c && typeof c === 'object');
        if (!list.length) return null;
        const stamped = list.filter(c => Number(c.changedAt) > 0);
        if (stamped.length) {
            let best = stamped[0];
            for (const c of stamped) if (Number(c.changedAt) > Number(best.changedAt)) best = c;
            return FavoritesService.normalizeConfig({ ...best });
        }
        const out = { ...list[0] };
        for (const k of SYNC_LISTS) {
            let all = [];
            for (const c of list) if (Array.isArray(c[k])) all = all.concat(c[k]);
            out[k] = all;
        }
        return FavoritesService.normalizeConfig(out);
    },

    /** My PC's copy for this profile (available from onInit). */
    loadMyPC: () => {
        try {
            if (typeof MyPC === 'undefined' || typeof MyPC.load !== 'function') return null;
            const cfg = MyPC.load('appConfig', null);
            const tracked = MyPC.load('tracked_matches', null);
            if (cfg && typeof cfg === 'object') {
                // before 1.4.0 a track saved only 'tracked_matches': keep those ids too
                if (!(Number(cfg.changedAt) > 0) && Array.isArray(tracked)) {
                    return { ...cfg, tracked_matches: [...(cfg.tracked_matches || []), ...tracked] };
                }
                return cfg;
            }
            if (Array.isArray(tracked) && tracked.length) return { tracked_matches: tracked };
        } catch (e) {}
        return null;
    },

    saveUserConfigLocally: (config) => {
        const cfg = config || State.appConfig;
        try {
            if (typeof MyPC !== 'undefined' && typeof MyPC.save === 'function') {
                // only when it changed: every save is backed up and sent to the player account by My PC
                const tracked = Array.isArray(cfg.tracked_matches) ? cfg.tracked_matches : [];
                if (JSON.stringify(MyPC.load('appConfig', null)) !== JSON.stringify(cfg)) MyPC.save('appConfig', cfg);
                if (JSON.stringify(MyPC.load('tracked_matches', null)) !== JSON.stringify(tracked)) MyPC.save('tracked_matches', tracked);
            }
        } catch (e) {}
    },

    loadUserConfigLocally: () => Storage.loadMyPC(),

    /** Push this profile's copy to the bridge (skipped when nothing changed since the last push). */
    syncToWidgetServiceBridge: async (config) => {
        const cfg = FavoritesService.normalizeConfig(config || State.appConfig);
        if (window.AppState && window.AppState.monitoredMatches) {
            cfg.tracked_matches = Array.from(window.AppState.monitoredMatches).map(Number).filter(Boolean);
        }
        const cleanUser = cleanName(State.currentUser?.name);
        const payloadObj = Storage.payload(cfg);
        const same = cleanUser + JSON.stringify(payloadObj);
        if (same === lastPushed) return true;
        payloadObj.updatedAt = Date.now();   // push time, read by the widget and the alerts service
        const payloadJson = JSON.stringify(payloadObj);
        return Storage._push(cfg, cleanUser, payloadJson, same);
    },

    payload: (cfg) => ({
            username: cleanName(State.currentUser?.name),
            changedAt: Number(cfg.changedAt) || 0,
            favorite_teams: cfg.favorite_teams || [],
            favorite_leagues: cfg.favorite_leagues || [],
            favorite_players: cfg.favorite_players || [],
            tracked_matches: cfg.tracked_matches || [],
            allowed_leagues: cfg.allowed_leagues || State.globalSettings?.allowed_leagues || [],
            buttonMappings: cfg.buttonMappings,
            widgetSettings: cfg.widgetSettings,
            serviceSettings: cfg.serviceSettings,
            apiSource: cfg.apiSource
    }),

    _push: async (cfg, cleanUser, payloadJson, same) => {
        lastPushed = same;   // set now: a second save of the same data while this one runs writes nothing
        try {
            const token = await getBridgeAuthToken();
            if (!token) throw new Error('no bridge sign-in');
            const docUrl = BRIDGE_DOC();

            // Read the profiles map so the other profiles (other TVs, other names) are kept
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

            const patchRes = await fetch(docUrl, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fields: {
                        latestConfigJson: { stringValue: payloadJson },
                        widgetSettingsJson: { stringValue: JSON.stringify(cfg.widgetSettings || {}) },
                        serviceSettingsJson: { stringValue: JSON.stringify(cfg.serviceSettings || {}) },
                        lastUsername: { stringValue: cleanUser },
                        updatedAt: { integerValue: String(Date.now()) },
                        profiles: { mapValue: { fields: existingProfiles } }
                    }
                })
            });
            if (patchRes.ok) {
                State.bridgeSynced = true;
                return true;
            }
        } catch (e) {
            console.warn("Widget/Service bridge sync warning:", e);
        }
        if (lastPushed === same) lastPushed = '';   // failed: the next save tries again
        return false;
    },

    /** This profile's copy on the bridge, or null (never another profile's copy). */
    loadFromWidgetServiceBridge: async (mypcUsername) => {
        try {
            const token = await getBridgeAuthToken();
            if (!token) return null;
            const res = await fetch(BRIDGE_DOC(), { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return null;
            lastBridgeRead = Date.now();
            const doc = await res.json();
            const entry = doc?.fields?.profiles?.mapValue?.fields?.[cleanName(mypcUsername)]?.stringValue;
            if (entry) {
                State.bridgeSynced = true;
                return JSON.parse(entry);
            }
        } catch (e) {}
        return null;
    },

    /** Put a merged copy in place: state, tracked matches, My PC's copy. Returns true when something changed. */
    apply: (cfg) => {
        const before = JSON.stringify(State.appConfig) + '|' + JSON.stringify([...(window.AppState?.monitoredMatches || [])]);
        State.appConfig = FavoritesService.normalizeConfig(cfg);
        if (window.AppState) window.AppState.monitoredMatches = new Set(State.appConfig.tracked_matches.map(Number).filter(Boolean));
        Storage.saveUserConfigLocally(State.appConfig);
        return before !== JSON.stringify(State.appConfig) + '|' + JSON.stringify(State.appConfig.tracked_matches);
    },

    /** At start (from onInit): My PC's copy at once, then the bridge's copy (waits at most 3 s). */
    loadUserConfig: async (mypcUsername) => {
        const username = mypcUsername || 'Player';
        State.currentUser = { uid: BRIDGE_CREDENTIALS.uid, email: `${cleanName(username)}@mypc.football`, name: username };
        const mine = Storage.loadMyPC();
        if (mine) Storage.apply(Storage.mergeCopies([mine]));

        const remoteP = Storage.loadFromWidgetServiceBridge(username);
        const finish = (remote) => {
            const merged = Storage.mergeCopies([mine, remote]) || FavoritesService.normalizeConfig(State.appConfig);
            // copies from before 1.4.0 (no stamp) were put together: stamp the result so every device agrees on it
            if (!(Number(merged.changedAt) > 0) && (mine || remote)) merged.changedAt = Date.now();
            const changed = Storage.apply(merged);
            // the bridge already has this version: no write
            if (remote && Number(remote.changedAt) > 0 && Number(remote.changedAt) === Number(State.appConfig.changedAt)) {
                const c = FavoritesService.normalizeConfig(State.appConfig);
                lastPushed = cleanName(State.currentUser?.name) + JSON.stringify(Storage.payload(c));
            }
            Storage.syncToWidgetServiceBridge(State.appConfig);
            return changed;
        };
        let late = false;
        const timeout = new Promise(r => setTimeout(() => { late = true; r('late'); }, 3000));
        const first = await Promise.race([remoteP, timeout]);
        if (first === 'late') {
            remoteP.then(remote => { if (finish(remote)) changeListeners.forEach(fn => { try { fn('load'); } catch (e) {} }); });
        } else {
            finish(first);
        }
        return State.appConfig;
    },

    /** On resume / when shown: another device may have changed something (at most one read a minute). */
    refreshFromBridge: async (force) => {
        if (!force && Date.now() - lastBridgeRead < 60000) return false;
        lastBridgeRead = Date.now();
        const remote = await Storage.loadFromWidgetServiceBridge(State.currentUser?.name);
        if (!remote || !(Number(remote.changedAt) > (Number(State.appConfig.changedAt) || 0))) return false;
        const changed = Storage.apply(Storage.mergeCopies([State.appConfig, remote]));
        if (changed) changeListeners.forEach(fn => { try { fn('remote'); } catch (e) {} });
        return changed;
    },

    /** Every change made by the user goes through here: stamped, saved in My PC, pushed to the bridge. */
    saveUserConfig: async (uid, config) => {
        if (config) State.appConfig = FavoritesService.normalizeConfig(config);
        if (window.AppState && window.AppState.monitoredMatches) {
            State.appConfig.tracked_matches = Array.from(window.AppState.monitoredMatches).map(Number).filter(Boolean);
        }
        State.appConfig.changedAt = Math.max(Date.now(), (Number(State.appConfig.changedAt) || 0) + 1);
        Storage.saveUserConfigLocally(State.appConfig);
        await Storage.syncToWidgetServiceBridge(State.appConfig);
    },

    loadGlobalSettings: async () => {
        if (typeof MyPC !== 'undefined' && MyPC.app_config && Array.isArray(MyPC.app_config.allowed_leagues)) {
            State.globalSettings.allowed_leagues = MyPC.app_config.allowed_leagues;
        }
        return State.globalSettings;
    }
};


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