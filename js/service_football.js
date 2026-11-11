/**
 * Football Service Client for My PC App
 * Uses MyPC.net.fetch for CORS-free API requests on Smart TVs and desktop
 */

const FOOTBALL_CONFIG = {
    APIS: [
        { url: "https://api-football-v1.p.rapidapi.com/v3", host: "api-football-v1.p.rapidapi.com", key: "47dc452270msh179deefacf1222dp162e3ejsn23be94c2331c" },
        { url: "https://api-football-v1.p.rapidapi.com/v3", host: "api-football-v1.p.rapidapi.com", key: "b3a3d033ffmsh6e94bc1a2adfb2ap197138jsn33bbf80e8bb2" },
        { url: "https://api-football-v1.p.rapidapi.com/v3", host: "api-football-v1.p.rapidapi.com", key: "cca156198fmshf3d7f508bb67393p1dcd50jsne575eb3e7518" },
        { url: "https://api-football-v1.p.rapidapi.com/v3", host: "api-football-v1.p.rapidapi.com", key: "71d5175770mshbd9b3fecebd8bfbp178df1jsn196f26d6458a" },
        { url: "https://v3.football.api-sports.io", host: "v3.football.api-sports.io", key: "cb397bed4ae3bce1f341cde74671ec94" }
    ],
    GLOBAL_LEAGUES: [1, 15, 1168],
    CONTINENT_LEAGUES: {
        EU: { CUP: [4], CL: [2], SECOND: [3, 848] },
        AF: { CUP: [6], CL: [12], SECOND: [20] },
        AS: { CUP: [15], CL: [17], SECOND: [18] },
        SA: { CUP: [9], CL: [13], SECOND: [11] },
        NA: { CUP: [22], CL: [16], SECOND: [] }
    },
    FRIENDLIES: [10, 666],
    FAVORITE_TEAMS: [85, 50, 541, 529, 23],
    // Wrapped API = our Firebase function (Firebase project iptv-8b60c, functions/index.js "footballRequest"):
    // GET <url>?endpoint=<api-football path>&<params>, answers the same JSON as API-Football
    // and rotates the keys on the server.
    WRAPPED_URL: "https://europe-west1-iptv-8b60c.cloudfunctions.net/footballRequest",
    SOURCES: ['wrapped', 'direct']
};

let currentApiIndex = 0;

const FootballClient = {
    /** 'wrapped' (Firebase function, default) or 'direct' (API-Football with the app's keys). */
    getSource: function() {
        const st = window.AppServices && window.AppServices.State;
        const src = st && st.appConfig && st.appConfig.apiSource;
        return FOOTBALL_CONFIG.SOURCES.includes(src) ? src : 'wrapped';
    },

    getWrappedUrl: function() {
        const appConfig = (typeof MyPC !== 'undefined' && MyPC.app_config) ? MyPC.app_config : {};
        return appConfig.wrappedUrl || FOOTBALL_CONFIG.WRAPPED_URL;
    },

    /** One GET through MyPC.net.fetch (no CORS on the TV) or the page's fetch when standalone. */
    request: async function(url, headers) {
        if (typeof MyPC !== 'undefined' && MyPC.net && typeof MyPC.net.fetch === 'function') {
            const response = await MyPC.net.fetch(url, { method: 'GET', headers, responseType: 'json', timeout: 20000 });
            if (!response.ok) throw new Error(`MyPC.net error: status ${response.status}`);
            return response.body || (typeof response.json === 'function' ? await response.json() : {});
        }
        const response = await fetch(url, { method: 'GET', headers });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    },

    /** Wrapped API: the Firebase function asks API-Football for us. */
    fetchWrapped: async function(cleanEndpoint, params) {
        const qs = new URLSearchParams(Object.assign({ endpoint: cleanEndpoint.replace(/^\//, '') }, params)).toString();
        const data = await this.request(`${this.getWrappedUrl()}?${qs}`, { 'Accept': 'application/json' });
        if (data && data.error === true) throw new Error(data.message || 'Wrapped API error');
        return data;
    },

    /**
     * Resolve effective API entry including any owner override from MyPC.app_config
     */
    getApiEntry: function() {
        const appConfig = (typeof MyPC !== 'undefined' && MyPC.app_config) ? MyPC.app_config : {};
        if (appConfig.apiKey) {
            return {
                url: appConfig.apiUrl || "https://api-football-v1.p.rapidapi.com/v3",
                host: appConfig.apiHost || "api-football-v1.p.rapidapi.com",
                key: appConfig.apiKey
            };
        }
        return FOOTBALL_CONFIG.APIS[currentApiIndex % FOOTBALL_CONFIG.APIS.length];
    },

    /**
     * Core fetch function using MyPC.net.fetch (falls back to native fetch in dev/standalone)
     */
    fetchData: async function(endpoint, params = {}, recursive = 0) {
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        if (recursive === 0 && this.getSource() === 'wrapped') {
            try {
                const wrapped = await this.fetchWrapped(cleanEndpoint, params);
                this.lastSource = 'wrapped';
                return wrapped || { response: [] };
            } catch (e) {
                // Wrapper down or unreachable: ask API-Football directly so the app still works.
                console.warn(`Wrapped API failed [${cleanEndpoint}], using direct football-api:`, e.message);
            }
        }
        this.lastSource = 'direct';
        const api = this.getApiEntry();
        
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${api.url}${cleanEndpoint}${queryString ? '?' + queryString : ''}`;
        
        let data = {};
        let err = null;

        try {
            // Priority 1: Use MyPC.net.fetch (CORS-free for Smart TV sandbox)
            if (typeof MyPC !== 'undefined' && MyPC.net && typeof MyPC.net.fetch === 'function') {
                const response = await MyPC.net.fetch(fullUrl, {
                    method: 'GET',
                    headers: {
                        'x-rapidapi-host': api.host,
                        'x-rapidapi-key': api.key,
                        'Accept': 'application/json'
                    },
                    responseType: 'json',
                    timeout: 20000
                });

                if (response.ok) {
                    data = response.body || (typeof response.json === 'function' ? await response.json() : {});
                } else {
                    throw new Error(`MyPC.net error: status ${response.status}`);
                }
            } else {
                // Standalone browser fallback
                const response = await fetch(fullUrl, {
                    method: 'GET',
                    headers: {
                        'x-rapidapi-host': api.host,
                        'x-rapidapi-key': api.key,
                        'Accept': 'application/json'
                    }
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                data = await response.json();
            }
        } catch (error) {
            err = error;
        }

        // Handle rate limits or 403 errors by rotating keys
        const isApiError = (data && data.errors && Object.keys(data.errors).length > 0) ||
                           (err && err.message && (err.message.includes("403") || err.message.includes("429")));
        
        if (recursive < 3 && isApiError) {
            console.warn("Football API Error detected, rotating API key...", data?.errors || err?.message);
            currentApiIndex = (currentApiIndex + 1) % FOOTBALL_CONFIG.APIS.length;
            return this.fetchData(endpoint, params, recursive + 1);
        }

        if (err && (!data || !data.response)) {
            console.error(`Football Client Error [${cleanEndpoint}]:`, err.message);
        }

        return data || { response: [] };
    },

    /**
     * Get Recommended matches based on user context
     */
    getRecommendedMatches: async function(country, city, continentCode) {
        const today = new Date().toISOString().split('T')[0];
        const countryLower = (country || "").toLowerCase();
        const cityLower = (city || "").toLowerCase();

        const data = await this.fetchData('fixtures', { date: today });
        const allMatches = data.response || [];
        
        if (!allMatches.length) return [];

        const localContinentData = FOOTBALL_CONFIG.CONTINENT_LEAGUES[continentCode] || { CUP: [], CL: [], SECOND: [] };

        const scoredMatches = allMatches.map(match => {
            let score = 0;
            const leagueId = match.league.id;
            const leagueCountry = (match.league.country || "").toLowerCase();
            const homeTeam = (match.teams.home.name || "").toLowerCase();
            const awayTeam = (match.teams.away.name || "").toLowerCase();
            const venueCity = (match.fixture.venue?.city || "").toLowerCase();
            const homeTeamId = match.teams.home.id;
            const awayTeamId = match.teams.away.id;

            if (FOOTBALL_CONFIG.GLOBAL_LEAGUES.includes(leagueId)) score = 1000;
            else if (localContinentData.CUP.includes(leagueId)) score = 900;
            else if (localContinentData.CL.includes(leagueId)) score = 800;
            else if (localContinentData.SECOND.includes(leagueId)) score = 700;
            else if (FOOTBALL_CONFIG.FAVORITE_TEAMS.includes(homeTeamId) || FOOTBALL_CONFIG.FAVORITE_TEAMS.includes(awayTeamId)) score = 750;
            else if (leagueCountry === countryLower && match.league.type === 'League') {
                score = 600;
                if (match.league.name.includes("Premier") || match.league.name.includes("1") || match.league.name.includes("Botola")) score += 50;
            }
            else if (leagueCountry === countryLower && match.league.type === 'Cup') score = 500;
            else if (FOOTBALL_CONFIG.FRIENDLIES.includes(leagueId)) {
                if (homeTeam.includes(countryLower) || awayTeam.includes(countryLower) || venueCity.includes(cityLower)) score = 400;
            }

            if (venueCity && cityLower && (venueCity.includes(cityLower) || homeTeam.includes(cityLower) || awayTeam.includes(cityLower))) score += 700;
            if (countryLower && (homeTeam === countryLower || awayTeam === countryLower)) score += 900;

            return { match, score };
        });

        return scoredMatches
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map(item => ({
                fixture_id: item.match.fixture.id,
                date: item.match.fixture.date,
                status: item.match.fixture.status.short,
                league: item.match.league,
                home: { ...item.match.teams.home, goals: item.match.goals.home },
                away: { ...item.match.teams.away, goals: item.match.goals.away },
                priority_score: item.score
            }));
    }
};

window.FootballClient = FootballClient;