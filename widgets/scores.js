// widgets/scores.js
// My PC Desktop Widget for Football Live
// Displays today's favorite match (or top live game) with score and status
export default async function (ctx) {
  const lang = ctx.lang || 'en';
  const labels = {
    en: { favMatch: "Today's Favorite Match", topMatch: "Today's Top Match", noGames: "No matches scheduled today", live: "LIVE", ft: "Full Time" },
    fr: { favMatch: "Match favori du jour", topMatch: "Match du jour", noGames: "Aucun match aujourd'hui", live: "EN DIRECT", ft: "Terminé" },
    es: { favMatch: "Partido favorito de hoy", topMatch: "Partido de hoy", noGames: "Sin partidos hoy", live: "EN VIVO", ft: "Final" },
    ar: { favMatch: "مباراة اليوم المفضلة", topMatch: "أبرز مباريات اليوم", noGames: "لا توجد مباريات اليوم", live: "مباشر", ft: "نهاية المباراة" }
  };
  const t = labels[lang] || labels.en;

  const today = new Date().toISOString().split('T')[0];
  const appConfig = ctx.config || {};
  const favTeams = new Set((appConfig.favorite_teams || [
    { id: 85, name: "Paris Saint Germain" },
    { id: 50, name: "Manchester City" },
    { id: 541, name: "Real Madrid" },
    { id: 529, name: "Barcelona" },
    { id: 23, name: "Morocco" }
  ]).map(x => x.id));
  
  const favLeagues = new Set((appConfig.favorite_leagues || [
    { id: 39 }, { id: 140 }, { id: 2 }
  ]).map(x => x.id));

  let chosenMatch = null;
  let isFav = false;

  try {
    const res = await ctx.fetch('https://api-football-v1.p.rapidapi.com/v3/fixtures?date=' + today, {
      headers: {
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
        'x-rapidapi-key': appConfig.apiKey || '47dc452270msh179deefacf1222dp162e3ejsn23be94c2331c',
        'Accept': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const list = data.response || [];

      // 1. Look for match involving a favorite team
      for (const m of list) {
        if (favTeams.has(m.teams?.home?.id) || favTeams.has(m.teams?.away?.id)) {
          chosenMatch = m;
          isFav = true;
          break;
        }
      }

      // 2. If none, look for a live match in a favorite league
      if (!chosenMatch) {
        const liveFavLeague = list.find(m => favLeagues.has(m.league?.id) && ['1H','HT','2H','ET','P'].includes(m.fixture?.status?.short));
        if (liveFavLeague) chosenMatch = liveFavLeague;
      }

      // 3. If none, look for any live match
      if (!chosenMatch) {
        const anyLive = list.find(m => ['1H','HT','2H','ET','P'].includes(m.fixture?.status?.short));
        if (anyLive) chosenMatch = anyLive;
      }

      // 4. Fallback to first favorite league match or first scheduled match
      if (!chosenMatch && list.length > 0) {
        chosenMatch = list.find(m => favLeagues.has(m.league?.id)) || list[0];
      }
    }
  } catch (err) {
    // Graceful fallback on network timeout
  }

  if (!chosenMatch) {
    return {
      view: {
        title: "Football Live",
        icon: '⚽',
        big: "0 Matches",
        sub: t.noGames,
        text: "Open Football Live to view calendars and standings",
        accent: '#38bdf8',
        link: 'home'
      },
      state: { lastCheck: Date.now() }
    };
  }

  const statusShort = chosenMatch.fixture?.status?.short;
  const isLive = ['1H','HT','2H','ET','P','BT'].includes(statusShort);
  const isFinished = ['FT','AET','PEN'].includes(statusShort);
  const elapsed = chosenMatch.fixture?.status?.elapsed || 0;

  const home = chosenMatch.teams?.home?.name || "Home";
  const away = chosenMatch.teams?.away?.name || "Away";
  const homeScore = chosenMatch.goals?.home ?? 0;
  const awayScore = chosenMatch.goals?.away ?? 0;

  let bigDisplay = `${homeScore} - ${awayScore}`;
  let subDisplay = `${elapsed}' ${t.live}`;
  let accentColor = '#22c55e'; // Green for live

  if (statusShort === 'NS') {
    const time = new Date(chosenMatch.fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bigDisplay = time;
    subDisplay = `Today ${time}`;
    accentColor = '#38bdf8'; // Blue for upcoming
  } else if (isFinished) {
    subDisplay = t.ft;
    accentColor = '#eab308'; // Amber for finished
  }

  const titleText = isFav ? `⭐ ${t.favMatch}` : t.topMatch;
  const matchDesc = `${home} vs ${away}`;

  return {
    view: {
      title: titleText,
      icon: '⚽',
      big: bigDisplay,
      sub: subDisplay,
      text: matchDesc,
      progress: isLive ? Math.min(1, elapsed / 90) : (isFinished ? 1 : 0),
      accent: accentColor,
      link: 'match/' + chosenMatch.fixture.id,
      rows: [
        { label: 'League', value: chosenMatch.league?.name || '' },
        { label: 'Venue', value: chosenMatch.fixture?.venue?.city ? `${chosenMatch.fixture.venue.city}, ${chosenMatch.fixture.venue.name || ''}` : (chosenMatch.fixture?.venue?.name || '') }
      ]
    },
    state: {
      lastMatchId: chosenMatch.fixture.id,
      lastScore: `${homeScore}-${awayScore}`,
      lastStatus: statusShort,
      lastUpdated: Date.now()
    }
  };
}
