// widgets/scores.js
// My PC Desktop Widget for Football Live
// Strictly 3-row broadcast layout:
//   Row 1: League Title (with status/minute)
//   Row 2: Home Logo  0 - 0  Away Logo (with team names/codes)
//   Row 3: Progress bar for match timing (0' -> 90' FT)
// Reads user's saved favorites & tracked matches from the Football Live cloud bridge + widget settings.

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

    // Check profile-specific config first if specified
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
    // Ignore network/auth fallback errors
  }
  return null;
}

function shortTeamCode(name) {
  const clean = String(name || 'TM').trim();
  const known = {
    'paris saint germain': 'PSG',
    'paris saint-germain': 'PSG',
    'real madrid': 'RMA',
    'barcelona': 'BAR',
    'fc barcelona': 'BAR',
    'manchester city': 'MCI',
    'manchester united': 'MUN',
    'ac milan': 'MIL',
    'inter': 'INT',
    'inter milan': 'INT',
    'juventus': 'JUV',
    'arsenal': 'ARS',
    'liverpool': 'LIV',
    'chelsea': 'CHE',
    'bayern munich': 'BAY',
    'bayern münchen': 'BAY',
    'borussia dortmund': 'BVB',
    'atletico madrid': 'ATM',
    'atlético madrid': 'ATM',
    'morocco': 'MAR'
  };
  const lower = clean.toLowerCase();
  if (known[lower]) return known[lower];
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0].length <= 3) {
    return parts[1].slice(0, 3).toUpperCase();
  }
  return clean.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || clean.slice(0, 3).toUpperCase();
}

export default async function (ctx) {
  const lang = ctx.lang || 'en';
  const labels = {
    en: { noGames: 'No Favorite Match Today', live: 'LIVE', ft: 'FT', ht: 'HT' },
    fr: { noGames: "Aucun match favori aujourd'hui", live: 'DIRECT', ft: 'FIN', ht: 'MT' },
    es: { noGames: 'Sin partido favorito hoy', live: 'VIVO', ft: 'FINAL', ht: 'MT' },
    ar: { noGames: 'لا توجد مباراة مفضلة اليوم', live: 'مباشر', ft: 'انتهت', ht: 'ش1' }
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

  // 1. Load live saved favorites from the user's MyPC Football cloud sync
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

  const trackedIds = new Set(
    (Array.isArray(savedConfig.tracked_matches) ? savedConfig.tracked_matches : []).map(Number).filter(Boolean)
  );

  const favTeamIds = new Set(favTeamsList.map(x => Number(x && x.id)).filter(Boolean));
  const favTeamNames = favTeamsList.map(x => String((x && x.name) || '').toLowerCase().trim()).filter(Boolean);

  const customTeam = String(settings.team || '').toLowerCase().trim();
  if (customTeam) {
    if (/^\d+$/.test(customTeam)) favTeamIds.add(Number(customTeam));
    else favTeamNames.unshift(customTeam);
  }

  const favLeagueIds = new Set(favLeaguesList.map(l => Number(l && l.id)).filter(Boolean));
  const favLeagueNames = favLeaguesList.map(l => String((l && l.name) || '').toLowerCase().trim()).filter(Boolean);

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
    // Allow partial match only if the user explicitly typed a custom search string in Widget Settings
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
      // Priority 0: Explicitly tracked matches today
      const trackedMatches = list
        .filter(m => trackedIds.has(Number(m?.fixture?.id)))
        .sort((a, b) => matchStatusPriority(a) - matchStatusPriority(b));

      // Priority 1: Matches of user's saved Favorite Teams
      const teamFavMatches = list
        .filter(m => isTeamFavorite(m?.teams?.home) || isTeamFavorite(m?.teams?.away))
        .sort((a, b) => matchStatusPriority(a) - matchStatusPriority(b));

      // Priority 2: Matches in user's saved Favorite Leagues
      const leagueFavMatches = list
        .filter(m => isLeagueFavorite(m?.league))
        .sort((a, b) => matchStatusPriority(a) - matchStatusPriority(b));

      if (trackedMatches.length > 0) {
        chosenMatch = trackedMatches[0];
      } else if (teamFavMatches.length > 0) {
        chosenMatch = teamFavMatches[0];
      } else if (settings.only_favs === false && leagueFavMatches.length > 0) {
        chosenMatch = leagueFavMatches[0];
      }
    }
  } catch (err) {
    // Graceful network fallback
  }

  // Strictly 3-row empty view when no favorite team plays today
  if (!chosenMatch) {
    const favSummary = favTeamsList.slice(0, 3).map(x => x.name).filter(Boolean).join(', ') || 'Add teams in app';
    return {
      view: {
        title: 'Football Live',
        icon: '⚽',
        big: '0 - 0',
        sub: `${t.noGames} (${favSummary})`,
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
  const homeCode = shortTeamCode(homeTeam.name);
  const awayCode = shortTeamCode(awayTeam.name);

  const homeScore = statusShort === 'NS' ? 0 : (chosenMatch.goals?.home ?? 0);
  const awayScore = statusShort === 'NS' ? 0 : (chosenMatch.goals?.away ?? 0);

  let timingTag = '';
  let progressVal = 0;
  let accentColor = '#38bdf8';

  if (isLive) {
    timingTag = statusShort === 'HT' ? t.ht : `${elapsed}' ${t.live}`;
    progressVal = statusShort === 'HT' ? 0.5 : Math.min(1, Math.max(0.05, elapsed / 90));
    accentColor = '#10b981';
  } else if (isFinished) {
    timingTag = t.ft;
    progressVal = 1;
    accentColor = '#f59e0b';
  } else {
    const kickOff = new Date(chosenMatch.fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    timingTag = kickOff;
    progressVal = 0.02;
    accentColor = '#38bdf8';
  }

  const leagueName = chosenMatch.league?.name || 'Matchday';
  // Row 1: League Title + timing badge
  const row1LeagueTitle = `${leagueName} · ${timingTag}`.slice(0, 40);
  // Row 2: Team Logo (icon) + "HOME 0 - 0 AWAY" (big) + Full names (sub) + Away Logo (image)
  const row2BigScore = `${homeCode}  ${homeScore} - ${awayScore}  ${awayCode}`;
  const row2SubNames = `${homeTeam.name || 'Home'} vs ${awayTeam.name || 'Away'}`;

  const homeLogo = /^https:\/\//.test(homeTeam.logo || '') ? homeTeam.logo : '⚽';
  const awayLogo = /^https:\/\//.test(awayTeam.logo || '') ? awayTeam.logo : undefined;

  // Strictly 3 rows max:
  // 1. Header: LeagueTitle (with Home crest icon & Away crest image)
  // 2. Scoreline: HOME 0 - 0 AWAY
  // 3. Progress bar: timing progress (0..1)
  return {
    view: {
      title: row1LeagueTitle,
      icon: homeLogo,
      image: awayLogo,
      big: row2BigScore,
      sub: row2SubNames,
      progress: progressVal,
      accent: accentColor,
      link: 'match/' + chosenMatch.fixture.id
    },
    state: {
      lastMatchId: chosenMatch.fixture.id,
      lastScore: `${homeScore}-${awayScore}`,
      lastStatus: statusShort,
      lastUpdated: nowMs,
      cachedConfig: savedConfig
    }
  };
}
