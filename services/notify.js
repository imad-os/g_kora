/**
 * ============================================================================
 * Football Live - My PC Background Notification Service (services/notify.js)
 * ============================================================================
 * WHAT THIS SERVICE DOES:
 * 1. Authenticates with the Football Live Firestore REST Bridge to load the
 *    user's live saved configuration (`favorite_teams`, `favorite_leagues`,
 *    `tracked_matches`, `allowed_leagues`, and `serviceSettings`).
 * 2. Filters & orders live matches according to the user's configured
 *    Notification Service Selection & Priority (`serviceSettings.sources` &
 *    `serviceSettings.priority`):
 *      - `tracked_matches`: Explicitly tracked matches (marked with red dot 🔴)
 *      - `favorite_teams`: Matches featuring the user's Favorite Teams (⭐)
 *      - `favorite_leagues`: Matches from the user's Favorite Leagues (❤️)
 *      - `allowed_leagues`: Matches from global Allowed Leagues
 * 3. Emits a strictly 2-row notification whenever a match starts, changes score
 *    (Goal), or finishes (Full Time):
 *      |-------------------|
 *      | RM 0 - 1 BRS      |  <- Row 1 (`title` / `titleHtml`): Match result with
 *      | Yamal 13'         |     team logos and the changed side in green (#4cd964)
 *      |-------------------|  <- Row 2 (`message`): Goal scorer & minute ("Yamal 13'")
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

async function fetchBridgeUserConfigs(ctxFetch) {
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

    let latest = null;
    if (fields.latestConfigJson && fields.latestConfigJson.stringValue) {
      try { latest = JSON.parse(fields.latestConfigJson.stringValue); } catch (e) {}
    }

    const profiles = {};
    if (fields.profiles && fields.profiles.mapValue && fields.profiles.mapValue.fields) {
      const pMap = fields.profiles.mapValue.fields;
      for (const k of Object.keys(pMap)) {
        if (pMap[k] && pMap[k].stringValue) {
          try {
            const pObj = JSON.parse(pMap[k].stringValue);
            profiles[k] = pObj;
            if (!latest || ((pObj.updatedAt || 0) > (latest.updatedAt || 0))) {
              latest = pObj;
            }
          } catch (e) {}
        }
      }
    }

    if (latest && fields.serviceSettingsJson && fields.serviceSettingsJson.stringValue) {
      try {
        const ss = JSON.parse(fields.serviceSettingsJson.stringValue);
        if (ss && typeof ss === 'object' && Object.keys(ss).length > 0) {
          latest.serviceSettings = ss;
        }
      } catch (e) {}
    }

    return { latest, profiles };
  } catch (e) {
    return null;
  }
}

function shortTeamCode(name) {
  const clean = String(name || 'TM').trim();
  const known = {
    'paris saint germain': 'PSG',
    'paris saint-germain': 'PSG',
    'real madrid': 'RM',
    'barcelona': 'BRS',
    'fc barcelona': 'BRS',
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

const WRAPPED_URL = 'https://europe-west1-iptv-8b60c.cloudfunctions.net/footballRequest';

/**
 * Asks API-Football for `endpoint` (e.g. 'fixtures') with `params`.
 * apiSource 'wrapped' (default) = our Firebase function footballRequest (it holds and rotates the keys);
 * if it does not answer, or apiSource is 'direct', API-Football is asked with the built-in keys.
 * Returns the `response` array, or null when nothing worked.
 */
async function fetchFootball(ctx, endpoint, params, apiSource, appConfig) {
  const okList = (data) => {
    const hasQuotaErr = data && data.errors && Object.keys(data.errors).length > 0 && (!data.response || data.response.length === 0);
    return (!hasQuotaErr && data && Array.isArray(data.response)) ? data.response : null;
  };
  if (apiSource !== 'direct') {
    try {
      const qs = new URLSearchParams(Object.assign({ endpoint }, params)).toString();
      const res = await ctx.fetch((appConfig.wrappedUrl || WRAPPED_URL) + '?' + qs, { headers: { 'Accept': 'application/json' } });
      if (res && res.ok) {
        const list = okList(await res.json());
        if (list) return list;
      }
    } catch (e) {}
  }
  const qs = new URLSearchParams(params).toString();
  const keysToTry = appConfig.apiKey ? [appConfig.apiKey, ...API_KEYS] : API_KEYS;
  for (const apiKey of keysToTry) {
    try {
      const res = await ctx.fetch('https://api-football-v1.p.rapidapi.com/v3/' + endpoint + '?' + qs, {
        headers: {
          'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
          'x-rapidapi-key': apiKey,
          'Accept': 'application/json'
        }
      });
      if (res && res.ok) {
        const list = okList(await res.json());
        if (list) return list;
      }
    } catch (e) {}
  }
  return null;
}

export default async function (ctx) {
  const st = ctx.state || { matchStates: {} };
  if (!st.matchStates) st.matchStates = {};
  const notifications = [];

  const appConfig = ctx.config || {};
  const bridgeData = await fetchBridgeUserConfigs(ctx.fetch);
  const latestCfg = (bridgeData && bridgeData.latest) ? bridgeData.latest : {};

  const mergedFavTeams = Array.isArray(latestCfg.favorite_teams)
    ? [...latestCfg.favorite_teams]
    : [...(appConfig.favorite_teams || [
        { id: 85, name: 'Paris Saint Germain' },
        { id: 50, name: 'Manchester City' },
        { id: 541, name: 'Real Madrid' },
        { id: 529, name: 'Barcelona' },
        { id: 489, name: 'AC Milan' },
        { id: 31, name: 'Morocco' }
      ])];

  const mergedFavLeagues = Array.isArray(latestCfg.favorite_leagues)
    ? [...latestCfg.favorite_leagues]
    : [...(appConfig.favorite_leagues || [])];

  const mergedAllowedLeagues =
    (Array.isArray(latestCfg.allowed_leagues) && latestCfg.allowed_leagues.length > 0)
      ? [...latestCfg.allowed_leagues]
      : [...(appConfig.allowed_leagues || [])];

  const trackedMatchIds = new Set(
    (Array.isArray(latestCfg.tracked_matches) ? latestCfg.tracked_matches : []).map(Number).filter(Boolean)
  );

  const activeServiceSettings = latestCfg.serviceSettings || {};

  // Resolve Service Selection & Priority configuration from Football Live app settings
  const defaultPriority = ['tracked_matches', 'favorite_teams', 'favorite_leagues', 'allowed_leagues'];
  const priorityOrder = Array.isArray(activeServiceSettings.priority) && activeServiceSettings.priority.length > 0
    ? activeServiceSettings.priority.filter(k => defaultPriority.includes(k))
    : defaultPriority;
  defaultPriority.forEach(k => {
    if (!priorityOrder.includes(k)) priorityOrder.push(k);
  });

  const mode = activeServiceSettings.mode || 'both';
  const sources = Object.assign(
    {
      tracked_matches: true,
      favorite_teams: true,
      favorite_leagues: false,
      allowed_leagues: false
    },
    activeServiceSettings.sources || {}
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

  const favTeamIds = new Set(mergedFavTeams.map(t => Number(t && t.id)).filter(Boolean));
  const favTeamNames = mergedFavTeams.map(t => String((t && t.name) || '').toLowerCase().trim()).filter(Boolean);
  const favLeagueIds = new Set(mergedFavLeagues.map(l => Number(l && l.id)).filter(Boolean));
  const allowedLeagueIds = new Set(mergedAllowedLeagues.map(l => Number(l && l.id)).filter(Boolean));

  function normClub(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[-.]/g, ' ')
      .replace(/\b(fc|cf|sc|ac|afc)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const favTeamNorms = new Set(favTeamNames.map(normClub).filter(Boolean));

  function isTeamFav(team) {
    if (!team) return false;
    const tid = Number(team.id);
    if (tid && favTeamIds.has(tid)) return true;
    const tnorm = normClub(team.name);
    return Boolean(tnorm && favTeamNorms.has(tnorm));
  }

  function pickLogo(m, scoringSide) {
    const homeLogo = m?.teams?.home?.logo || '';
    const awayLogo = m?.teams?.away?.logo || '';
    const leagueLogo = m?.league?.logo || '';

    if (scoringSide === 'home' && /^https:\/\//.test(homeLogo)) return homeLogo;
    if (scoringSide === 'away' && /^https:\/\//.test(awayLogo)) return awayLogo;
    if (isTeamFav(m?.teams?.home) && /^https:\/\//.test(homeLogo)) return homeLogo;
    if (isTeamFav(m?.teams?.away) && /^https:\/\//.test(awayLogo)) return awayLogo;
    if (/^https:\/\//.test(homeLogo)) return homeLogo;
    if (/^https:\/\//.test(awayLogo)) return awayLogo;
    if (/^https:\/\//.test(leagueLogo)) return leagueLogo;
    return '';
  }

  function getMatchPriorityRank(m, mid) {
    const checks = {
      tracked_matches: trackedMatchIds.has(mid) || Boolean(st.matchStates[mid]),
      favorite_teams: isTeamFav(m?.teams?.home) || isTeamFav(m?.teams?.away),
      favorite_leagues: favLeagueIds.has(Number(m?.league?.id)),
      allowed_leagues: allowedLeagueIds.has(Number(m?.league?.id))
    };
    for (let i = 0; i < priorityOrder.length; i++) {
      const key = priorityOrder[i];
      if (sources[key] && checks[key]) return i;
    }
    return -1;
  }

  function extractLastGoalScorer(m, elapsedFallback) {
    const evs = Array.isArray(m?.events) ? m.events : [];
    const goals = evs.filter(e => e && e.type === 'Goal');
    if (goals.length > 0) {
      const last = goals[goals.length - 1];
      const player = last?.player?.name || 'Goal';
      const min = last?.time?.elapsed
        ? `${last.time.elapsed}${last.time.extra ? '+' + last.time.extra : ''}'`
        : `${elapsedFallback || 0}'`;
      return `${player} ${min}`;
    }
    return `Goal ${elapsedFallback || 0}'`;
  }

  try {
    let liveMatches = await fetchFootball(ctx, 'fixtures', { live: 'all' }, latestCfg.apiSource, appConfig);

    if (Array.isArray(liveMatches)) {
      for (const m of liveMatches) {
        const mid = Number(m?.fixture?.id);
        if (!mid) continue;

        const priorityRank = getMatchPriorityRank(m, mid);
        if (priorityRank === -1) continue;

        const home = m.teams?.home?.name || 'Home';
        const away = m.teams?.away?.name || 'Away';
        const homeCode = shortTeamCode(home);
        const awayCode = shortTeamCode(away);
        const homeLogo = /^https:\/\//.test(m.teams?.home?.logo || '') ? m.teams.home.logo : '';
        const awayLogo = /^https:\/\//.test(m.teams?.away?.logo || '') ? m.teams.away.logo : '';

        const homeScore = m.goals?.home ?? 0;
        const awayScore = m.goals?.away ?? 0;
        const currentScore = `${homeScore}-${awayScore}`;
        const currentStatus = m.fixture?.status?.short || 'LIVE';
        const elapsed = m.fixture?.status?.elapsed || 1;
        const leagueName = m.league?.name || 'Live Match';

        const prev = st.matchStates[mid];

        // 1. Kick-Off (2 rows: Row 1 = "RM 0 - 0 BRS", Row 2 = "Kick-Off 1'")
        if (!prev) {
          const logo = pickLogo(m, null);
          const item = {
            username: '*',
            title: `${homeCode} ${homeScore} - ${awayScore} ${awayCode}`.slice(0, 60),
            message: `Kick-Off ${elapsed}'`.slice(0, 100),
            icon: homeLogo || logo,
            awayLogo: awayLogo || undefined,
            color: '#4cd964',
            priorityRank,
            link: `football-live:match/${mid}`
          };
          if (logo) item.image = logo;
          notifications.push(item);

          st.matchStates[mid] = {
            score: currentScore,
            homeScore,
            awayScore,
            status: currentStatus,
            home,
            away,
            league: leagueName,
            logo
          };
          continue;
        }

        // 2. Goal / Score Change (Strictly 2 rows:
        //    Row 1: "RM 0 - 🟢 1 BRS" (changed side in green + team logos)
        //    Row 2: "Yamal 13'" (scorer & minute))
        if (prev.score !== currentScore) {
          const scoringSide = homeScore > (prev.homeScore ?? 0) ? 'home' : (awayScore > (prev.awayScore ?? 0) ? 'away' : null);
          const logo = pickLogo(m, scoringSide);
          const row1Result = scoringSide === 'home'
            ? `🟢 ${homeCode} ${homeScore} - ${awayScore} ${awayCode}`
            : (scoringSide === 'away'
              ? `${homeCode} ${homeScore} - 🟢 ${awayScore} ${awayCode}`
              : `${homeCode} ${homeScore} - ${awayScore} ${awayCode}`);

          const titleHtml = scoringSide === 'home'
            ? `<span style="color:#4cd964;font-weight:700">${homeLogo ? `<img src="${homeLogo}" width="20" height="20"> ` : ''}${homeScore}</span> - ${awayScore}${awayLogo ? ` <img src="${awayLogo}" width="20" height="20">` : ''}`
            : `<span style="color:#fff">${homeLogo ? `<img src="${homeLogo}" width="20" height="20"> ` : ''}${homeScore}</span> - <span style="color:#4cd964;font-weight:700">${awayScore}${awayLogo ? ` <img src="${awayLogo}" width="20" height="20">` : ''}</span>`;

          const row2Scorer = extractLastGoalScorer(m, elapsed);

          const item = {
            username: '*',
            title: row1Result.slice(0, 60),
            titleHtml,
            message: row2Scorer.slice(0, 100),
            icon: homeLogo || logo,
            awayLogo: awayLogo || undefined,
            changedSide: scoringSide || 'away',
            color: '#4cd964',
            priorityRank,
            link: `football-live:match/${mid}`
          };
          if (logo) item.image = logo;
          notifications.push(item);
        }

        // 3. Full Time (Strictly 2 rows: Row 1 = "RM 0 - 1 BRS", Row 2 = "FT 90'")
        if (['FT', 'AET', 'PEN'].includes(currentStatus) && prev.status !== currentStatus) {
          const logo = pickLogo(m, null);
          const item = {
            username: '*',
            title: `${homeCode} ${homeScore} - ${awayScore} ${awayCode}`.slice(0, 60),
            message: `${currentStatus} ${elapsed || 90}'`.slice(0, 100),
            icon: homeLogo || logo,
            awayLogo: awayLogo || undefined,
            color: '#4cd964',
            priorityRank,
            link: `football-live:match/${mid}`
          };
          if (logo) item.image = logo;
          notifications.push(item);
        }

        st.matchStates[mid] = {
          score: currentScore,
          homeScore,
          awayScore,
          status: currentStatus,
          home,
          away,
          league: leagueName,
          logo: pickLogo(m, null)
        };
      }
    }
  } catch (e) {
    // Graceful recovery on network timeout
  }

  // Sort notifications by the user's configured priority order
  notifications.sort((a, b) => (a.priorityRank ?? 99) - (b.priorityRank ?? 99));

  // Prune old match states so state JSON stays well under 10,000 chars
  const stateKeys = Object.keys(st.matchStates);
  if (stateKeys.length > 45) {
    for (let i = 0; i < stateKeys.length - 45; i++) {
      delete st.matchStates[stateKeys[i]];
    }
  }

  return {
    notifications: notifications.slice(0, 15),
    state: st
  };
}
