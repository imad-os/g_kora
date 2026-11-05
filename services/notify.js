// services/notify.js
// My PC Background Notification Service
// Sends push alerts for game start, goals / score changes, and game end for favorite & tracked matches.

export default async function (ctx) {
  const st = ctx.state || { matchStates: {} };
  const notifications = [];

  const appConfig = ctx.config || {};
  const favTeamIds = new Set((appConfig.favorite_teams || [
    { id: 85 }, { id: 50 }, { id: 541 }, { id: 529 }, { id: 23 }
  ]).map(t => t.id));

  const favLeagueIds = new Set((appConfig.favorite_leagues || [
    { id: 39 }, { id: 140 }, { id: 2 }
  ]).map(l => l.id));

  try {
    // 1. Fetch current live matches
    const res = await ctx.fetch('https://api-football-v1.p.rapidapi.com/v3/fixtures?live=all', {
      headers: {
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
        'x-rapidapi-key': appConfig.apiKey || '47dc452270msh179deefacf1222dp162e3ejsn23be94c2331c',
        'Accept': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const liveMatches = data.response || [];

      for (const m of liveMatches) {
        const mid = m.fixture.id;
        const home = m.teams.home.name;
        const away = m.teams.away.name;
        const homeScore = m.goals.home ?? 0;
        const awayScore = m.goals.away ?? 0;
        const currentScore = `${homeScore}-${awayScore}`;
        const currentStatus = m.fixture.status.short;
        const elapsed = m.fixture.status.elapsed || '';

        const isFav = favTeamIds.has(m.teams.home.id) || favTeamIds.has(m.teams.away.id) || favLeagueIds.has(m.league.id);
        const wasTracked = !!(st.matchStates[mid]);

        // Only monitor favorite or tracked matches
        if (!isFav && !wasTracked) continue;

        const prev = st.matchStates[mid];

        if (!prev) {
          // Newly encountered live match (Kick-off!)
          notifications.push({
            username: '*',
            title: `▶️ Match Started: ${home} vs ${away}`,
            message: `${m.league.name} · Kick-off!`,
            image: m.teams.home.logo,
            link: `football-live:match/${mid}`
          });
          st.matchStates[mid] = { score: currentScore, status: currentStatus, home, away, league: m.league.name, logo: m.teams.home.logo };
          continue;
        }

        // Detect Goal / Score change
        if (prev.score !== currentScore) {
          notifications.push({
            username: '*',
            title: `⚽ GOAL! ${home} ${homeScore} - ${awayScore} ${away}`,
            message: `${m.league.name} · ${elapsed}'`,
            image: m.teams.home.logo,
            link: `football-live:match/${mid}`
          });
        }

        // Detect Full Time / Game End
        if (['FT', 'AET', 'PEN'].includes(currentStatus) && prev.status !== currentStatus) {
          notifications.push({
            username: '*',
            title: `🏁 Full Time: ${home} ${homeScore} - ${awayScore} ${away}`,
            message: `Final Result · ${m.league.name}`,
            image: m.teams.home.logo,
            link: `football-live:match/${mid}`
          });
        }

        st.matchStates[mid] = { score: currentScore, status: currentStatus, home, away, league: m.league.name, logo: m.teams.home.logo };
      }
    }
  } catch (e) {
    // Graceful recovery from network timeout
  }

  // Cap notification backlog at 10 to respect quota
  const capped = notifications.slice(0, 10);
  return {
    notifications: capped,
    state: st
  };
}
