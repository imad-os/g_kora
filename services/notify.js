// services/notify.js
// My PC Background Notification Service for Football Live
// Reads the user's saved favorite teams, favorite leagues, and tracked matches from Firestore REST bridge,
// and sends push alerts with team logos (image: https://...) for kick-off, goals/score changes, and full time.

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
          try { profiles[k] = JSON.parse(pMap[k].stringValue); } catch (e) {}
        }
      }
    }
    return { latest, profiles };
  } catch (e) {
    return null;
  }
}

export default async function (ctx) {
  const st = ctx.state || { matchStates: {} };
  if (!st.matchStates) st.matchStates = {};
  const notifications = [];

  const appConfig = ctx.config || {};
  const bridgeData = await fetchBridgeUserConfigs(ctx.fetch);
  const mergedFavTeams = [...(appConfig.favorite_teams || [])];
  const mergedFavLeagues = [...(appConfig.favorite_leagues || [])];
  const trackedMatchIds = new Set();

  if (bridgeData) {
    if (bridgeData.latest) {
      if (Array.isArray(bridgeData.latest.favorite_teams)) mergedFavTeams.push(...bridgeData.latest.favorite_teams);
      if (Array.isArray(bridgeData.latest.favorite_leagues)) mergedFavLeagues.push(...bridgeData.latest.favorite_leagues);
      if (Array.isArray(bridgeData.latest.tracked_matches)) {
        bridgeData.latest.tracked_matches.forEach(id => trackedMatchIds.add(Number(id)));
      }
    }
    if (bridgeData.profiles) {
      for (const pCfg of Object.values(bridgeData.profiles)) {
        if (pCfg && Array.isArray(pCfg.favorite_teams)) mergedFavTeams.push(...pCfg.favorite_teams);
        if (pCfg && Array.isArray(pCfg.favorite_leagues)) mergedFavLeagues.push(...pCfg.favorite_leagues);
        if (pCfg && Array.isArray(pCfg.tracked_matches)) {
          pCfg.tracked_matches.forEach(id => trackedMatchIds.add(Number(id)));
        }
      }
    }
  }

  // Fallback defaults if no favorites were configured yet
  if (mergedFavTeams.length === 0) {
    mergedFavTeams.push(
      { id: 85, name: 'Paris Saint Germain' },
      { id: 50, name: 'Manchester City' },
      { id: 541, name: 'Real Madrid' },
      { id: 529, name: 'Barcelona' },
      { id: 489, name: 'AC Milan' },
      { id: 31, name: 'Morocco' }
    );
  }

  const favTeamIds = new Set(mergedFavTeams.map(t => Number(t && t.id)).filter(Boolean));
  const favTeamNames = mergedFavTeams.map(t => String((t && t.name) || '').toLowerCase().trim()).filter(Boolean);
  const favLeagueIds = new Set(mergedFavLeagues.map(l => Number(l && l.id)).filter(Boolean));

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

  try {
    const keysToTry = appConfig.apiKey ? [appConfig.apiKey, ...API_KEYS] : API_KEYS;
    let liveMatches = null;
    for (const apiKey of keysToTry) {
      const res = await ctx.fetch('https://api-football-v1.p.rapidapi.com/v3/fixtures?live=all', {
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
          liveMatches = data.response;
          break;
        }
      }
    }

    if (Array.isArray(liveMatches)) {
      for (const m of liveMatches) {
        const mid = Number(m?.fixture?.id);
        if (!mid) continue;

        const home = m.teams?.home?.name || 'Home';
        const away = m.teams?.away?.name || 'Away';
        const homeScore = m.goals?.home ?? 0;
        const awayScore = m.goals?.away ?? 0;
        const currentScore = `${homeScore}-${awayScore}`;
        const currentStatus = m.fixture?.status?.short || 'LIVE';
        const elapsed = m.fixture?.status?.elapsed || '';
        const leagueName = m.league?.name || 'Live Match';

        const isFav = isTeamFav(m.teams?.home) || isTeamFav(m.teams?.away) || favLeagueIds.has(Number(m.league?.id));
        const isTracked = trackedMatchIds.has(mid) || Boolean(st.matchStates[mid]);

        if (!isFav && !isTracked) continue;

        const prev = st.matchStates[mid];

        if (!prev) {
          const logo = pickLogo(m, null);
          const item = {
            username: '*',
            title: `▶️ Kick-Off: ${home} vs ${away}`.slice(0, 60),
            message: `${leagueName} · Live now (${homeScore} - ${awayScore})`.slice(0, 200),
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

        // Detect Goal / Score change and highlight the scoring team's crest logo
        if (prev.score !== currentScore) {
          const scoringSide = homeScore > (prev.homeScore ?? 0) ? 'home' : (awayScore > (prev.awayScore ?? 0) ? 'away' : null);
          const scorerTeam = scoringSide === 'home' ? home : (scoringSide === 'away' ? away : '');
          const logo = pickLogo(m, scoringSide);
          const item = {
            username: '*',
            title: `⚽ GOAL! ${home} ${homeScore} - ${awayScore} ${away}`.slice(0, 60),
            message: `${scorerTeam ? scorerTeam + ' scores! · ' : ''}${leagueName}${elapsed ? ' · ' + elapsed + "'" : ''}`.slice(0, 200),
            link: `football-live:match/${mid}`
          };
          if (logo) item.image = logo;
          notifications.push(item);
        }

        // Detect Half Time or Full Time
        if (['FT', 'AET', 'PEN'].includes(currentStatus) && prev.status !== currentStatus) {
          const logo = pickLogo(m, null);
          const item = {
            username: '*',
            title: `🏁 Full Time: ${home} ${homeScore} - ${awayScore} ${away}`.slice(0, 60),
            message: `Final Score · ${leagueName}`.slice(0, 200),
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
