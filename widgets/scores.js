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
 *      - Row 1 (`title`): League Title
 *      - Row 2 (`icon` + `big` + `image` + `sub`):
 *          Home Team Logo (`icon`) + Score (`0 - 0`) + Away Team Logo (`image`)
 *          (Uses team logos only — no team names in the score row; changed
 *           scores highlight in green `#4cd964`)
 *      - Row 3 (`progress`): Match timing progress bar (0' -> 90' FT)
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

async function fetchSavedUserConfig(ctxFetch, preferredProfile) {
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

    if (preferredProfile && fields.profiles && fields.profiles.mapValue && fields.profiles.mapValue.fields) {
      const clean = String(preferredProfile).toLowerCase().replace(/[^a-z0-9_]/g, '');
      const pEntry = fields.profiles.mapValue.fields[clean];
      if (pEntry && pEntry.stringValue) {
        try { return JSON.parse(pEntry.stringValue); } catch (e) {}
      }
    }

    if (fields.latestConfigJson && fields.latestConfigJson.stringValue) {
      return JSON.parse(fields.latestConfigJson.stringValue);
    }
  } catch (e) {
    // Graceful network/auth fallback
  }
  return null;
}

export default async function (ctx) {
  const lang = ctx.lang || 'en';
  const labels = {
    en: { noGames: 'No Match Today', live: 'LIVE', ft: 'FT', ht: 'HT' },
    fr: { noGames: "Aucun match aujourd'hui", live: 'DIRECT', ft: 'FIN', ht: 'MT' },
    es: { noGames: 'Sin partido hoy', live: 'VIVO', ft: 'FINAL', ht: 'MT' },
    ar: { noGames: 'لا توجد مباراة اليوم', live: 'مباشر', ft: 'انتهت', ht: 'ش1' }
  };
  const t = labels[lang] || labels.en;

  const nowMs = ctx.now || Date.now();
  const nowDate = new Date(nowMs);
  const year = nowDate.getFullYear();
  const month = String(nowDate.getMonth() + 1).padStart(2, '0');
  const day = String(nowDate.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  const appConfig = ctx.config || {};
  const settings = ctx.settings || {};
  const prevState = ctx.state || {};

  // 1. Load live saved user config from the My PC Football cloud bridge
  const cloudConfig = await fetchSavedUserConfig(ctx.fetch, settings.profile || '');
  const savedConfig = cloudConfig || prevState.cachedConfig || {};

  const favTeamsList =
    (Array.isArray(savedConfig.favorite_teams) && savedConfig.favorite_teams.length > 0)
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

  const favLeaguesList =
    (Array.isArray(savedConfig.favorite_leagues) && savedConfig.favorite_leagues.length > 0)
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

  // 2. Resolve Widget Selection & Priority configuration
  const rawWidgetSettings = savedConfig.widgetSettings || {};
  const defaultPriority = ['tracked_matches', 'favorite_teams', 'favorite_leagues', 'allowed_leagues'];
  const priorityOrder = Array.isArray(rawWidgetSettings.priority) && rawWidgetSettings.priority.length > 0
    ? rawWidgetSettings.priority.filter(k => defaultPriority.includes(k))
    : defaultPriority;
  defaultPriority.forEach(k => {
    if (!priorityOrder.includes(k)) priorityOrder.push(k);
  });

  const sources = Object.assign(
    {
      tracked_matches: true,
      favorite_teams: true,
      favorite_leagues: false,
      allowed_leagues: false
    },
    rawWidgetSettings.sources || {}
  );

  // Support optional host widget settings overrides
  if (settings.only_tracked === true) {
    sources.tracked_matches = true;
    sources.favorite_teams = false;
    sources.favorite_leagues = false;
    sources.allowed_leagues = false;
  } else if (settings.only_favs === true && !rawWidgetSettings.sources) {
    sources.favorite_teams = true;
    sources.favorite_leagues = false;
    sources.allowed_leagues = false;
  } else if (settings.only_favs === false && !rawWidgetSettings.sources) {
    sources.favorite_leagues = true;
  }

  const favTeamIds = new Set(favTeamsList.map(x => Number(x && x.id)).filter(Boolean));
  const favTeamNames = favTeamsList.map(x => String((x && x.name) || '').toLowerCase().trim()).filter(Boolean);

  const customTeam = String(settings.team || '').toLowerCase().trim();
  if (customTeam) {
    if (/^\d+$/.test(customTeam)) favTeamIds.add(Number(customTeam));
    else favTeamNames.unshift(customTeam);
  }

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
  const customTeamNorm = customTeam && !/^\d+$/.test(customTeam) ? normClub(customTeam) : '';

  function isTeamFavorite(team) {
    if (!team) return false;
    const tid = Number(team.id);
    if (tid && favTeamIds.has(tid)) return true;
    const tnorm = normClub(team.name);
    if (!tnorm) return false;
    if (favTeamNorms.has(tnorm)) return true;
    if (customTeamNorm && tnorm.includes(customTeamNorm)) return true;
    return false;
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

  let chosenMatch = null;

  try {
    const keysToTry = appConfig.apiKey ? [appConfig.apiKey, ...API_KEYS] : API_KEYS;
    let list = [];
    for (const apiKey of keysToTry) {
      const res = await ctx.fetch('https://api-football-v1.p.rapidapi.com/v3/fixtures?date=' + today, {
        headers: {
          'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
          'x-rapidapi-key': apiKey,
          'Accept': 'application/json'
        }
      });
      if (res && res.ok) {
        const data = await res.json();
        const hasQuotaErr = data && data.errors && Object.keys(data.errors).length > 0 && (!data.response || data.response.length === 0);
        if (!hasQuotaErr && Array.isArray(data?.response)) {
          list = data.response;
          break;
        }
      }
    }

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

      for (const sourceKey of priorityOrder) {
        if (!sources[sourceKey]) continue;
        const candidates = buckets[sourceKey] || [];
        if (candidates.length > 0) {
          chosenMatch = candidates[0];
          break;
        }
      }
    }
  } catch (err) {
    // Graceful network fallback
  }

  // Strictly 3-row empty view when no match matches the configured sources today
  if (!chosenMatch) {
    return {
      view: {
        title: 'Football Live',
        icon: '⚽',
        big: '0 - 0',
        sub: t.noGames,
        progress: 0,
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
  const elapsed = Number(chosenMatch.fixture?.status?.elapsed) || 0;

  const homeTeam = chosenMatch.teams?.home || {};
  const awayTeam = chosenMatch.teams?.away || {};

  const homeScore = statusShort === 'NS' ? 0 : (chosenMatch.goals?.home ?? 0);
  const awayScore = statusShort === 'NS' ? 0 : (chosenMatch.goals?.away ?? 0);
  const currentScoreStr = `${homeScore}-${awayScore}`;

  const scoreChanged =
    prevState.lastMatchId === chosenMatch.fixture?.id &&
    prevState.lastScore &&
    prevState.lastScore !== currentScoreStr;

  let timingTag = '';
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
    const kickOff = new Date(chosenMatch.fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    timingTag = kickOff;
    progressVal = 0.02;
    accentColor = '#e50914';
  }

  const leagueName = chosenMatch.league?.name || 'Matchday';
  // Row 1: League Title
  const row1LeagueTitle = `${leagueName} · ${timingTag}`.slice(0, 40);
  // Row 2: Logos ONLY + Score ("0 - 0") — no team names or codes
  const row2BigScore = `${homeScore} - ${awayScore}`;

  const homeLogo = /^https:\/\//.test(homeTeam.logo || '') ? homeTeam.logo : '⚽';
  const awayLogo = /^https:\/\//.test(awayTeam.logo || '') ? awayTeam.logo : undefined;

  return {
    view: {
      title: row1LeagueTitle,
      icon: homeLogo,
      image: awayLogo,
      big: row2BigScore,
      sub: timingTag,
      progress: progressVal,
      accent: accentColor,
      link: 'match/' + chosenMatch.fixture.id
    },
    state: {
      lastMatchId: chosenMatch.fixture.id,
      lastScore: currentScoreStr,
      lastStatus: statusShort,
      lastUpdated: nowMs,
      cachedConfig: savedConfig
    }
  };
}
