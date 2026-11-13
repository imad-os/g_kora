/**
 * ============================================================================
 * Football Live - My PC Desktop Widget (widgets/scores.js)
 * ============================================================================
 * WHAT THIS WIDGET DOES:
 * 1. Authenticates with the Football Live Firestore REST Bridge to load the
 *    user's live saved configuration (`favorite_teams`, `favorite_leagues`,
 *    `tracked_matches`, `allowed_leagues`, and `widgetSettings`).
 * 2. Evaluates today's football fixtures using the user's configured Widget
 *    Selection & Priority settings (`widgetSettings.sources` & `widgetSettings.priority`):
 *      - `tracked_matches`: Explicitly tracked matches (marked with red dot 🔴)
 *      - `favorite_teams`: Matches featuring the user's starred Favorite Teams (⭐)
 *      - `favorite_leagues`: Matches from the user's Favorite Leagues (❤️)
 *      - `allowed_leagues`: Matches from global Allowed Leagues
 *    Within each enabled priority tier, matches are ranked by status:
 *      Live (1H, HT, 2H, ET, P) > Upcoming (NS) > Finished (FT, AET, PEN).
 * 3. Renders a strictly 3-row, logos-only broadcast widget view:
 *      - When no match today: Shows "No Match Today" (`text`) with no `0 - 0`
 *        score and no progress bar.
 *      - When match has NOT started yet (`NS` / `TBD`):
 *          Row 1 (`icon` + `title`): League logo + League Title
 *          Row 2 (`versus.left` + `big` + `versus.right`): Home Logo + `0 - 0` + Away Logo
 *          Row 3 (`sub`): Kick-off start time (e.g. `Starts at 20:00`), with
 *          NO progress bar.
 *      - When match HAS started (`1H`, `HT`, `2H`, `ET`, `P`, `FT`, etc.):
 *          Row 1 (`title`): League Title · Live Minute / Status
 *          Row 2 (`versus.left` + `big` + `versus.right`): Home Logo + Score + Away Logo
 *          Row 3 (`progress`): Match timing progress bar (0' -> 90' FT)
 * ============================================================================
 */

const FB_API_KEY = 'AIzaSyClgzoMBEKizx-r7abMvAmLgGpk_p748IU';
const FB_PROJECT = 'iptv-8b60c';
const BRIDGE_EMAIL = 'mypc_bridge@mypc.football';
const BRIDGE_PASS = 'MyPC_bridge_football2024!';
const BRIDGE_UID = '34n9lRAx7uUMeDQ3KW32H07qJhz1';

const API_KEYS = [
  '47dc452270msh179deefacf1222dp162e3ejsn23be94c2331c',
  'b3a3d033ffmsh6e94bc1a2adfb2ap197138jsn33bbf80e8bb2',
  'cca156198fmshf3d7f508bb67393p1dcd50jsne575eb3e7518'
];

async function fetchSavedUserConfig(ctxFetch) {
  try {
    const authRes = await ctxFetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: BRIDGE_EMAIL, password: BRIDGE_PASS, returnSecureToken: true })
      }
    );
    if (!authRes.ok) return null;
    const authData = await authRes.json();
    const idToken = authData.idToken;
    const uid = authData.localId || BRIDGE_UID;
    if (!idToken) return null;

    const docRes = await ctxFetch(
      `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/usersSettings/${uid}`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    if (!docRes.ok) return null;
    const doc = await docRes.json();
    const fields = doc.fields || {};

    let bestConfig = null;
    if (fields.latestConfigJson && fields.latestConfigJson.stringValue) {
      try { bestConfig = JSON.parse(fields.latestConfigJson.stringValue); } catch (e) {}
    }

    if (fields.profiles && fields.profiles.mapValue && fields.profiles.mapValue.fields) {
      const pFields = fields.profiles.mapValue.fields;
      for (const key of Object.keys(pFields)) {
        const entry = pFields[key];
        if (entry && entry.stringValue) {
          try {
            const parsed = JSON.parse(entry.stringValue);
            if (!bestConfig || ((parsed.updatedAt || 0) > (bestConfig.updatedAt || 0))) {
              bestConfig = parsed;
            }
          } catch (e) {}
        }
      }
    }

    if (bestConfig && fields.widgetSettingsJson && fields.widgetSettingsJson.stringValue) {
      try {
        const ws = JSON.parse(fields.widgetSettingsJson.stringValue);
        if (ws && typeof ws === 'object' && Object.keys(ws).length > 0) {
          bestConfig.widgetSettings = ws;
        }
      } catch (e) {}
    }

    return bestConfig;
  } catch (e) {
    // Graceful network/auth fallback
  }
  return null;
}

const WRAPPED_URL = 'https://iptv-lists.mypc-app.workers.dev/footballRequest';

/**
 * Asks API-Football for `endpoint` (e.g. 'fixtures') with `params` through the source the user chose:
 * 'wrapped' (default) = our Cloudflare Worker footballRequest (it holds and rotates the keys), no fallback;
 * 'direct' = API-Football with the built-in keys.
 * Returns { list, error, source }: `list` is the response array or null, `error` the reason when it failed.
 */
async function fetchFootball(ctx, endpoint, params, apiSource, appConfig) {
  const source = apiSource === 'direct' ? 'direct' : 'wrapped';
  const errText = (data) => {
    if (!data || !data.errors) return '';
    const vals = Array.isArray(data.errors) ? data.errors : Object.values(data.errors);
    if (!vals.length || (Array.isArray(data.response) && data.response.length)) return '';
    return vals.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' · ');
  };
  if (source === 'wrapped') {
    try {
      const qs = new URLSearchParams(Object.assign({ endpoint }, params)).toString();
      const res = await ctx.fetch((appConfig.wrappedUrl || WRAPPED_URL) + '?' + qs, { headers: { 'Accept': 'application/json' } });
      let data = null;
      try { data = await res.json(); } catch (e) {}
      if (!res || !res.ok) return { list: null, source, error: ((data && (data.message || (typeof data.error === 'string' && data.error))) ? (data.message || data.error) + ' (HTTP ' + res.status + ')' : 'HTTP ' + (res && res.status)) };
      const err = errText(data);
      if (err) return { list: null, source, error: err };
      return { list: Array.isArray(data && data.response) ? data.response : [], source, error: '' };
    } catch (e) {
      return { list: null, source, error: (e && e.message) || 'network error' };
    }
  }
  const qs = new URLSearchParams(params).toString();
  const keysToTry = appConfig.apiKey ? [appConfig.apiKey, ...API_KEYS] : API_KEYS;
  let lastErr = '';
  for (const apiKey of keysToTry) {
    try {
      const res = await ctx.fetch('https://api-football-v1.p.rapidapi.com/v3/' + endpoint + '?' + qs, {
        headers: {
          'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
          'x-rapidapi-key': apiKey,
          'Accept': 'application/json'
        }
      });
      if (!res || !res.ok) { lastErr = 'HTTP ' + (res && res.status); continue; }
      const data = await res.json();
      const err = errText(data);
      if (err) { lastErr = err; continue; }
      return { list: Array.isArray(data && data.response) ? data.response : [], source, error: '' };
    } catch (e) { lastErr = (e && e.message) || 'network error'; }
  }
  return { list: null, source, error: lastErr || 'no answer' };
}

export default async function (ctx) {
  const lang = ctx.lang || 'en';
  const labels = {
    en: { noGames: 'No Match Today', live: 'LIVE', ft: 'FT', ht: 'HT', startsAt: 'Starts at', tbd: 'TBD' },
    fr: { noGames: "Aucun match aujourd'hui", live: 'DIRECT', ft: 'FIN', ht: 'MT', startsAt: 'Début à', tbd: 'À définir' },
    es: { noGames: 'Sin partido hoy', live: 'VIVO', ft: 'FINAL', ht: 'MT', startsAt: 'Empieza a las', tbd: 'Por definir' },
    ar: { noGames: 'لا توجد مباراة اليوم', live: 'مباشر', ft: 'انتهت', ht: 'ش1', startsAt: 'تبدأ الساعة', tbd: 'لم يحدد' }
  };
  const t = labels[lang] || labels.en;

  const nowMs = ctx.now || Date.now();
  const nowDate = new Date(nowMs);
  const year = nowDate.getFullYear();
  const month = String(nowDate.getMonth() + 1).padStart(2, '0');
  const day = String(nowDate.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  const appConfig = ctx.config || {};
  const prevState = ctx.state || {};

  // 1. Load live saved user config from the Football Live app cloud bridge
  const cloudConfig = await fetchSavedUserConfig(ctx.fetch);
  const savedConfig = cloudConfig || prevState.cachedConfig || {};

  const favTeamsList = Array.isArray(savedConfig.favorite_teams)
    ? savedConfig.favorite_teams
    : (Array.isArray(appConfig.favorite_teams) && appConfig.favorite_teams.length > 0)
      ? appConfig.favorite_teams
      : [
          { id: 85, name: 'Paris Saint Germain' },
          { id: 50, name: 'Manchester City' },
          { id: 541, name: 'Real Madrid' },
          { id: 529, name: 'Barcelona' },
          { id: 489, name: 'AC Milan' },
          { id: 31, name: 'Morocco' }
        ];

  const favLeaguesList = Array.isArray(savedConfig.favorite_leagues)
    ? savedConfig.favorite_leagues
    : (Array.isArray(appConfig.favorite_leagues) && appConfig.favorite_leagues.length > 0)
      ? appConfig.favorite_leagues
      : [
          { id: 2, name: 'UEFA Champions League' },
          { id: 39, name: 'Premier League' },
          { id: 140, name: 'La Liga' },
          { id: 135, name: 'Serie A' }
        ];

  const allowedLeaguesList =
    (Array.isArray(savedConfig.allowed_leagues) && savedConfig.allowed_leagues.length > 0)
      ? savedConfig.allowed_leagues
      : (Array.isArray(appConfig.allowed_leagues) && appConfig.allowed_leagues.length > 0)
        ? appConfig.allowed_leagues
        : [
            { id: 39, name: 'Premier League' },
            { id: 140, name: 'La Liga' },
            { id: 135, name: 'Serie A' },
            { id: 78, name: 'Bundesliga' },
            { id: 61, name: 'Ligue 1' },
            { id: 2, name: 'UEFA Champions League' },
            { id: 3, name: 'UEFA Europa League' }
          ];

  const trackedIds = new Set(
    (Array.isArray(savedConfig.tracked_matches) ? savedConfig.tracked_matches : []).map(Number).filter(Boolean)
  );

  // 2. Resolve Widget Selection & Priority configuration exclusively from Football Live app settings
  const rawWidgetSettings = savedConfig.widgetSettings || {};
  const defaultPriority = ['tracked_matches', 'favorite_teams', 'favorite_leagues', 'allowed_leagues'];
  const priorityOrder = Array.isArray(rawWidgetSettings.priority) && rawWidgetSettings.priority.length > 0
    ? rawWidgetSettings.priority.filter(k => defaultPriority.includes(k))
    : defaultPriority;
  defaultPriority.forEach(k => {
    if (!priorityOrder.includes(k)) priorityOrder.push(k);
  });

  const mode = rawWidgetSettings.mode || 'both';
  const sources = Object.assign(
    {
      tracked_matches: true,
      favorite_teams: true,
      favorite_leagues: false,
      allowed_leagues: false
    },
    rawWidgetSettings.sources || {}
  );
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

  const favTeamIds = new Set(favTeamsList.map(x => Number(x && x.id)).filter(Boolean));
  const favTeamNames = favTeamsList.map(x => String((x && x.name) || '').toLowerCase().trim()).filter(Boolean);

  const favLeagueIds = new Set(favLeaguesList.map(l => Number(l && l.id)).filter(Boolean));
  const favLeagueNames = favLeaguesList.map(l => String((l && l.name) || '').toLowerCase().trim()).filter(Boolean);
  const allowedLeagueIds = new Set(allowedLeaguesList.map(l => Number(l && l.id)).filter(Boolean));

  function normClub(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[-.]/g, ' ')
      .replace(/\b(fc|cf|sc|ac|afc)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const favTeamNorms = new Set(favTeamNames.map(normClub).filter(Boolean));

  function isTeamFavorite(team) {
    if (!team) return false;
    const tid = Number(team.id);
    if (tid && favTeamIds.has(tid)) return true;
    const tnorm = normClub(team.name);
    if (!tnorm) return false;
    return favTeamNorms.has(tnorm);
  }

  function isLeagueFavorite(league) {
    if (!league) return false;
    const lid = Number(league.id);
    if (lid && favLeagueIds.has(lid)) return true;
    const lname = String(league.name || '').toLowerCase().trim();
    if (!lname) return false;
    return favLeagueNames.some(fn => fn && (lname === fn || lname.includes(fn)));
  }

  function isLeagueAllowed(league) {
    if (!league) return false;
    return allowedLeagueIds.has(Number(league.id));
  }

  function matchStatusPriority(m) {
    const s = m?.fixture?.status?.short || '';
    if (['1H', 'HT', '2H', 'ET', 'P', 'BT'].includes(s)) return 0; // Live first
    if (s === 'NS' || s === 'TBD') return 1; // Upcoming second
    return 2; // Finished third
  }

  const MAX_MATCHES = 3;
  const chosenList = [];
  let chosenMatch = null;
  let fetched = null;

  try {
    fetched = await fetchFootball(ctx, 'fixtures', { date: today }, savedConfig.apiSource, appConfig);
    let list = fetched.list || [];

    if (list.length > 0) {
      const buckets = {
        tracked_matches: list
          .filter(m => trackedIds.has(Number(m?.fixture?.id)))
          .sort((a, b) => matchStatusPriority(a) - matchStatusPriority(b)),
        favorite_teams: list
          .filter(m => isTeamFavorite(m?.teams?.home) || isTeamFavorite(m?.teams?.away))
          .sort((a, b) => matchStatusPriority(a) - matchStatusPriority(b)),
        favorite_leagues: list
          .filter(m => isLeagueFavorite(m?.league))
          .sort((a, b) => matchStatusPriority(a) - matchStatusPriority(b)),
        allowed_leagues: list
          .filter(m => isLeagueAllowed(m?.league))
          .sort((a, b) => matchStatusPriority(a) - matchStatusPriority(b))
      };

      // up to 3 matches from EVERY enabled source, in the priority order (tracked + favorite teams together, owner request 2026-11-13)
      const seen = new Set();
      for (const sourceKey of priorityOrder) {
        if (!sources[sourceKey]) continue;
        for (const m of (buckets[sourceKey] || [])) {
          const id = Number(m?.fixture?.id);
          if (!id || seen.has(id) || chosenList.length >= MAX_MATCHES) continue;
          seen.add(id);
          chosenList.push(m);
        }
      }
      chosenMatch = chosenList[0] || null;
    }
  } catch (err) {
    // Graceful network fallback
  }

  // Empty state when no match today matches the configured sources:
  // Show clearly that there is no match today, without "0 - 0" or an empty progress bar.
  if (!chosenMatch && fetched && fetched.error) {
    // Show the source's error instead of "No Match Today", and which source is in use.
    return {
      view: {
        title: 'Football Live · ' + (fetched.source === 'direct' ? 'Direct football-api' : 'Wrapped API'),
        icon: '⚠️',
        text: String(fetched.error).slice(0, 120),
        accent: '#ef4444',
        link: 'account'
      },
      state: {
        lastCheck: nowMs,
        cachedConfig: savedConfig
      }
    };
  }

  if (!chosenMatch) {
    return {
      view: {
        title: 'Football Live',
        icon: '⚽',
        text: t.noGames,
        accent: '#64748b',
        link: 'account'
      },
      state: {
        lastCheck: nowMs,
        cachedConfig: savedConfig
      }
    };
  }

  const statusShort = chosenMatch.fixture?.status?.short || 'NS';
  const isLive = ['1H', 'HT', '2H', 'ET', 'P', 'BT'].includes(statusShort);
  const isFinished = ['FT', 'AET', 'PEN'].includes(statusShort);
  const hasStarted = isLive || isFinished;
  const elapsed = Number(chosenMatch.fixture?.status?.elapsed) || 0;

  const homeTeam = chosenMatch.teams?.home || {};
  const awayTeam = chosenMatch.teams?.away || {};

  const homeScore = !hasStarted ? 0 : (chosenMatch.goals?.home ?? 0);
  const awayScore = !hasStarted ? 0 : (chosenMatch.goals?.away ?? 0);
  const currentScoreStr = `${homeScore}-${awayScore}`;

  const scoreChanged =
    prevState.lastMatchId === chosenMatch.fixture?.id &&
    prevState.lastScore &&
    prevState.lastScore !== currentScoreStr;

  let timingTag = '';
  let startLabel = '';
  let progressVal = 0;
  let accentColor = '#e50914';

  if (isLive) {
    timingTag = statusShort === 'HT' ? t.ht : `${elapsed}' ${t.live}`;
    progressVal = statusShort === 'HT' ? 0.5 : Math.min(1, Math.max(0.05, elapsed / 90));
    accentColor = '#4cd964';
  } else if (isFinished) {
    timingTag = t.ft;
    progressVal = 1;
    accentColor = scoreChanged ? '#4cd964' : '#e50914';
  } else {
    const kickOffDate = chosenMatch.fixture?.date ? new Date(chosenMatch.fixture.date) : null;
    const kickOff = kickOffDate && !isNaN(kickOffDate.getTime())
      ? kickOffDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      : '';
    startLabel = (statusShort === 'TBD' || !kickOff) ? t.tbd : `${t.startsAt} ${kickOff}`;
    accentColor = '#e50914';
  }

  const leagueName = chosenMatch.league?.name || 'Matchday';
  // Row 1: League Title (with live/FT status when started)
  const row1LeagueTitle = (hasStarted ? `${leagueName} · ${timingTag}` : leagueName).slice(0, 40);
  // Row 2: Logos ONLY + Score ("0 - 0") — no team names or codes
  const row2BigScore = `${homeScore} - ${awayScore}`;

  const pic = (u) => /^https:\/\//.test(u || '') ? u : '';
  const homeLogo = pic(homeTeam.logo) || '⚽';
  const awayLogo = pic(awayTeam.logo) || '⚽';
  // Row 1: the competition's own logo (or its country's flag) before its name, never a team's flag
  const leagueLogo = pic(chosenMatch.league?.logo) || pic(chosenMatch.league?.flag) || '🏆';

  let view = {
    title: row1LeagueTitle,
    icon: leagueLogo,
    big: row2BigScore,
    versus: { left: homeLogo, right: awayLogo },   // Row 2: home flag  0 - 0  away flag
    accent: accentColor,
    link: 'match/' + chosenMatch.fixture.id
  };

  // Row 3: Show progress bar ONLY when match has started; otherwise show when it will start
  if (hasStarted) {
    view.progress = progressVal;
  } else {
    view.sub = startLabel;
  }

  // 2 or 3 matches: one line each (competition logo, home flag, score, away flag, minute / start time)
  if (chosenList.length > 1) {
    const LIVE = ['1H', 'HT', '2H', 'ET', 'P', 'BT'], DONE = ['FT', 'AET', 'PEN'];
    let anyLive = false;
    const lines = chosenList.map((m) => {
      const st = m.fixture?.status?.short || 'NS';
      const live = LIVE.includes(st), done = DONE.includes(st);
      if (live) anyLive = true;
      const d = m.fixture?.date ? new Date(m.fixture.date) : null;
      const ko = d && !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      const info = live ? (st === 'HT' ? t.ht : (Number(m.fixture?.status?.elapsed) || 0) + "'") : done ? t.ft : (st === 'TBD' || !ko ? t.tbd : ko);
      return {
        icon: pic(m.league?.logo) || pic(m.league?.flag) || '🏆',
        left: pic(m.teams?.home?.logo) || '⚽',
        score: (live || done) ? `${m.goals?.home ?? 0} - ${m.goals?.away ?? 0}` : '0 - 0',
        right: pic(m.teams?.away?.logo) || '⚽',
        info: String(info).slice(0, 16)
      };
    });
    view = { title: 'Football Live', icon: '⚽', matches: lines, accent: anyLive ? '#4cd964' : accentColor, link: 'home' };
  }

  return {
    view,
    state: {
      lastMatchId: chosenMatch.fixture.id,
      lastScore: currentScoreStr,
      lastStatus: statusShort,
      lastUpdated: nowMs,
      cachedConfig: savedConfig
    }
  };
}
