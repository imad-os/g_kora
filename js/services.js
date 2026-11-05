"use strict";

/**
 * Football App Services - My PC Smart TV Integration with Seamless Firebase Backend
 * 
 * Manages app users seamlessly using MyPC profile username authenticated
 * with the Football app's Firebase Firestore (usersSettings/{uid}),
 * with dual persistence to MyPC.save and local storage.
 */

// Firebase Configuration for the Football App backend
const firebaseConfig = {
    apiKey: "AIzaSyClgzoMBEKizx-r7abMvAmLgGpk_p748IU", 
    authDomain: "iptv-8b60c.firebaseapp.com",
    projectId: "iptv-8b60c",
    storageBucket: "iptv-8b60c.firebasestorage.app",
    messagingSenderId: "259048691910",
    appId: "1:259048691910:web:b57f9eeda5546ce4d8dfc7"
};

// Global State
const State = {
    currentUser: { name: "Player", email: "player@mypc.football", uid: "local_player" },
    appConfig: {
        favorite_teams: [
            { id: 85, name: "Paris Saint Germain" },
            { id: 50, name: "Manchester City" },
            { id: 541, name: "Real Madrid" },
            { id: 529, name: "Barcelona" },
            { id: 23, name: "Morocco" }
        ],
        favorite_leagues: [
            { id: 39, name: "Premier League" },
            { id: 140, name: "La Liga" },
            { id: 2, name: "UEFA Champions League" }
        ],
        favorite_players: [],
        buttonMappings: {
            dateNext: 'pageUp',
            datePrev: 'pageDown',
            favToggle: 'y',
            trackToggle: 'run'
        },
        theme: 'dark-bleu'
    },
    globalSettings: {
        allowed_leagues: [
            { id: 39, name: "Premier League" },
            { id: 140, name: "La Liga" },
            { id: 135, name: "Serie A" },
            { id: 78, name: "Bundesliga" },
            { id: 61, name: "Ligue 1" },
            { id: 2, name: "UEFA Champions League" },
            { id: 3, name: "UEFA Europa League" }
        ]
    },
    firebaseConnected: false
};

const Helpers = {
    formatDate: (date) => {
        if (!(date instanceof Date) || isNaN(date)) date = new Date();
        return date.toLocaleDateString("en-CA");
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
        if (type === 'team') return !!(appConfig.favorite_teams && appConfig.favorite_teams.some(team => team.id === idNum));
        if (type === 'league') return !!(appConfig.favorite_leagues && appConfig.favorite_leagues.some(league => league.id === idNum));
        if (type === 'player') return !!(appConfig.favorite_players && appConfig.favorite_players.some(p => p.id === idNum));
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

        if (typeof MyPC !== 'undefined' && MyPC.voice && typeof MyPC.voice.say === 'function') {
            MyPC.voice.say(message);
        }

        setTimeout(() => {
            toast.style.animation = 'fadeOutToast 0.5s ease-out';
            setTimeout(() => toast.remove(), 500);
        }, 4000);
    },

    showPageError: (message) => {
        const container = document.getElementById('content-container');
        if (!container) return;

        container.innerHTML = `
            <div class="page-error">
                <i class="ph ph-warning-octagon"></i>
                <h2>Oops! Something went wrong.</h2>
                <p>${message}</p>
                <button class="styled-button focusable" onclick="window.AppRouter.go('home')">Reload App</button>
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
                const msg = "Some match data may be temporarily unavailable.";
                console.warn("API returned partial errors:", data.errors);
                Helpers.showToast(msg, 'alert');
            }

            return (data && data.response) ? data.response : [];
        } catch (error) {
            console.error("API Error detected in fetch:", error);
            
            const container = document.getElementById('content-container');
            const isLoading = container && (container.querySelector('.skeleton-row') || container.querySelector('.skeleton-detail-header'));

            const errorMessages = error.message || "Failed to load football data.";
            if (isLoading) {
                Helpers.showPageError(errorMessages);
            } else {
                Helpers.showToast(errorMessages, 'error');
            }
            return null;
        }
    }
};

// --- FavoritesService (Using MyPC Native Storage & Firebase) ---
const FavoritesService = {
    normalizeConfig: (cfg) => {
        const c = cfg || {};
        const toArr = (v) => Array.isArray(v) ? v : [];
        const mergeUniqueById = (a, b) => {
            const out = [];
            const seen = new Set();
            [...toArr(a), ...toArr(b)].forEach(it => {
                const id = Number(it && it.id);
                if (!id || seen.has(id)) return;
                seen.add(id);
                out.push({ ...it, id });
            });
            return out;
        };

        c.favorite_teams = mergeUniqueById(c.favorite_teams, c.favourit_teams);
        c.favorite_leagues = mergeUniqueById(c.favorite_leagues, c.favourite_leagues);
        c.favorite_players = mergeUniqueById(c.favorite_players, c.favourite_players);

        delete c.favourit_teams;
        delete c.favourite_leagues;
        delete c.favourite_players;

        c.buttonMappings = Object.assign({
            dateNext: 'pageUp',
            datePrev: 'pageDown',
            favToggle: 'y',
            trackToggle: 'run'
        }, c.buttonMappings || {});

        return c;
    },

    ensure: () => {
        State.appConfig = FavoritesService.normalizeConfig(State.appConfig || {});
        State.appConfig.favorite_teams = State.appConfig.favorite_teams || [];
        State.appConfig.favorite_leagues = State.appConfig.favorite_leagues || [];
        State.appConfig.favorite_players = State.appConfig.favorite_players || [];
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
        arr.push({ ...item, id });
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

// --- Storage using Seamless Firebase Auth & Firestore + MyPC.save ---
let firebaseDb = null;
let firebaseAuth = null;

const Storage = {
    saveUserConfigLocally: (config) => {
        try {
            localStorage.setItem('appConfig', JSON.stringify(config || State.appConfig));
        } catch (e) {}
    },

    loadUserConfigLocally: () => {
        try {
            const configStr = localStorage.getItem('appConfig');
            return configStr ? JSON.parse(configStr) : null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Seamless Firebase Authentication Bridge:
     * Takes MyPC profile username, signs into or creates corresponding Firebase account,
     * and syncs Firestore with MyPC.save.
     */
    initSeamlessFirebase: async (mypcUsername) => {
        const username = mypcUsername || "MyPCPlayer";
        const cleanUser = username.toLowerCase().replace(/[^a-z0-9_]/g, '') || "player";
        const email = `${cleanUser}@mypc.football`;
        const password = `MyPC_${cleanUser}_football2024!`;

        if (typeof firebase !== 'undefined' && firebase.initializeApp) {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                firebaseAuth = firebase.auth();
                firebaseDb = firebase.firestore();

                let userCredential = null;
                try {
                    userCredential = await firebaseAuth.signInWithEmailAndPassword(email, password);
                } catch (signInErr) {
                    if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
                        userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
                    } else {
                        console.warn("Firebase sign in error:", signInErr.code);
                    }
                }

                if (userCredential && userCredential.user) {
                    const u = userCredential.user;
                    State.currentUser = { uid: u.uid, email: u.email, name: username };
                    State.firebaseConnected = true;
                    console.log(`Firebase connected seamlessly for user: ${username} (UID: ${u.uid})`);

                    // Sync remote Firestore config
                    const doc = await firebaseDb.collection('usersSettings').doc(u.uid).get();
                    if (doc.exists) {
                        const remoteConfig = doc.data();
                        State.appConfig = FavoritesService.normalizeConfig(remoteConfig);
                        Storage.saveUserConfigLocally(State.appConfig);
                        if (typeof MyPC !== 'undefined' && MyPC.save) MyPC.save(State.appConfig);
                        return State.appConfig;
                    } else {
                        // First time: write initial config to Firestore
                        await firebaseDb.collection('usersSettings').doc(u.uid).set(State.appConfig, { merge: true });
                    }
                }
            } catch (fbErr) {
                console.warn("Seamless Firebase initialization skipped or offline:", fbErr.message);
            }
        }
        return null;
    },

    loadUserConfig: async (mypcUsername) => {
        // Try seamless Firebase sync first
        const fbConfig = await Storage.initSeamlessFirebase(mypcUsername);
        if (fbConfig) return fbConfig;

        // Fallback to MyPC.load()
        try {
            if (typeof MyPC !== 'undefined' && typeof MyPC.load === 'function') {
                const saved = await MyPC.load();
                if (saved && typeof saved === 'object') {
                    State.appConfig = FavoritesService.normalizeConfig(saved);
                    Storage.saveUserConfigLocally(State.appConfig);
                    return State.appConfig;
                }
            }
        } catch (e) {
            console.warn("MyPC.load error, checking local fallback:", e);
        }

        const local = Storage.loadUserConfigLocally();
        if (local) {
            State.appConfig = FavoritesService.normalizeConfig(local);
        }
        return State.appConfig;
    },

    saveUserConfig: async (uid, config) => {
        State.appConfig = config || State.appConfig;
        Storage.saveUserConfigLocally(State.appConfig);

        // 1. Save to Firebase Firestore if connected
        if (firebaseDb && State.currentUser && State.currentUser.uid && State.currentUser.uid !== 'local_player') {
            try {
                await firebaseDb.collection('usersSettings').doc(State.currentUser.uid).set(State.appConfig, { merge: true });
                console.log("Firebase: saved user settings to Firestore.");
            } catch (err) {
                console.warn("Firebase save error:", err.message);
            }
        }

        // 2. Save to MyPC native storage
        try {
            if (typeof MyPC !== 'undefined' && typeof MyPC.save === 'function') {
                await MyPC.save(State.appConfig);
                console.log("MyPC: saved configuration successfully.");
            }
        } catch (e) {
            console.error("MyPC.save error:", e);
        }
    },

    loadGlobalSettings: async () => {
        if (typeof MyPC !== 'undefined' && MyPC.app_config && MyPC.app_config.allowed_leagues) {
            State.globalSettings.allowed_leagues = MyPC.app_config.allowed_leagues;
        }
        return State.globalSettings;
    }
};

// Initial local load
const cached = Storage.loadUserConfigLocally();
if (cached) {
    State.appConfig = FavoritesService.normalizeConfig(cached);
}

// Authentication abstraction for My PC TV profiles
const auth = {
    get currentUser() { return State.currentUser; },
    onAuthStateChanged: function(cb) {
        if (typeof cb === 'function') {
            setTimeout(() => cb(State.currentUser), 50);
        }
    },
    signOut: async function() {
        Helpers.showToast("TV Profile managed by My PC", "info");
    }
};

window.AppServices = { State, API, Storage, Helpers, FavoritesService, auth };