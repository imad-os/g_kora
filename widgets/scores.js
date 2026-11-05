// widgets/scores.js
// My PC Desktop Widget for Football Live
// Displays today's favorite match (or top live game) with score and status

export default async function (ctx) {
  const lang = ctx.lang || 'en';
  const labels = {
    en: { favMatch: "Today's Favorite Match", topMatch: "Today's Top Match", noGames: "No favorite match today", live: "LIVE", ft: "Full Time" },
    fr: { favMatch: "Match favori du jour", topMatch: "Match du jour", noGames: "Aucun match favori aujourd'hui", live: "EN DIRECT", ft: "Terminé" },
    es: { favMatch: "Partido favorito de hoy", topMatch: "Partido de hoy", noGames: "Sin partido favorito hoy", live: "EN VIVO", ft: "Final" },
    ar: { favMatch: "مباراة اليوم المفضلة", topMatch: "أبرز مباريات اليوم", noGames: "لا توجد مباريات مفضلة اليوم", live: "مباشر", ft: "نهاية المباراة" }
  };
  const t = labels[lang] || labels.en;

  // Timezone-safe local date YYYY-MM-DD
  const nowMs = ctx.now || Date.now();
  const nowDate = new Date(nowMs);
  const year = nowDate.getFullYear();
  const month = String(nowDate.getMonth() + 1).padStart(2, '0');
  const day = String(nowDate.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  const appConfig = ctx.config || {};
  const settings = ctx.settings || {};

  // Extract all configured favorite teams across current & legacy keys + widget settings
  const rawFavTeams = [
    ...(appConfig.favorite_teams || []),
    ...(appConfig.favourit_teams || []),
    ...(appConfig.favourite_teams || []),
    // Top world clubs in default list
    { id: 85, name: "Paris Saint Germain" },
    { id: 50, name: "Manchester City" },
    { id: 541, name: "Real Madrid" },
    { id: 529, name: "Barcelona" },
    { id: 489, name: "AC Milan" },
    { id: 496, name: "Juventus" },
    { id: 505, name: "Inter Milan" },
    { id: 42, name: "Arsenal" },
    { id: 40, name: "Liverpool" },
    { id: 33, name: "Manchester United" },
    { id: 157, name: "Bayern Munich" },
    { id: 165, name: "Borussia Dortmund" },
    { id: 530, name: "Atletico Madrid" },
    { id: 49, name: "Chelsea" },
    { id: 194, name: "Ajax" },
    { id: 489, name: "AC Milan" },
    { id: 23, name: "Morocco" }
  ];

  const favTeamIds = new Set(rawFavTeams.map(x => Number(x && x.id)).filter(Boolean));
  const favTeamNames = rawFavTeams.map(x => String(x && x.name || '').toLowerCase().trim()).filter(Boolean);

  // If user typed a custom favorite team in Widget Settings (Control Panel > Widgets)
  const customTeam = String(settings.team || '').toLowerCase().trim();
  if (customTeam) {
    if (/^\d+$/.test(customTeam)) favTeamIds.add(Number(customTeam));
    else favTeamNames.unshift(customTeam);
  }

  // Favorite leagues: ID & Name
  const rawFavLeagues = [
    ...(appConfig.favorite_leagues || []),
    ...(appConfig.favourite_leagues || []),
    { id: 2, name: "UEFA Champions League" },
    { id: 3, name: "UEFA Europa League" },
    { id: 848, name: "UEFA Europa Conference League" },
    { id: 39, name: "Premier League" },
    { id: 140, name: "La Liga" },
    { id: 135, name: "Serie A" },
    { id: 78, name: "Bundesliga" },
    { id: 61, name: "Ligue 1" }
  ];

  const favLeagueIds = new Set(rawFavLeagues.map(l => Number(l && l.id)).filter(Boolean));
  const favLeagueNames = rawFavLeagues.map(l => String(l && l.name || '').toLowerCase().trim()).filter(Boolean);

  function isTeamFavorite(team) {
    if (!team) return false;
    const tid = Number(team.id);
    if (tid && favTeamIds.has(tid)) return true;
    const tname = String(team.name || '').toLowerCase();
    if (favTeamNames.some(fn => fn && (tname.includes(fn) || fn.includes(tname)))) return true;
    return false;
  }

  function isLeagueFavorite(league) {
    if (!league) return false;
    const lid = Number(league.id);
    if (lid && favLeagueIds.has(lid)) return true;
    const lname = String(league.name || '').toLowerCase();
    if (favLeagueNames.some(fn => fn && (lname.includes(fn) || fn.includes(lname)))) return true;
    return false;
  }

  let chosenMatch = null;
  let isFavTeam = false;

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

      // 1. Gather all matches involving a favorite team
      const teamFavMatches = list.filter(m => isTeamFavorite(m.teams?.home) || isTeamFavorite(m.teams?.away));
      if (teamFavMatches.length > 0) {
        // Prioritize: Live first, then Scheduled (NS), then Finished (FT)
        const liveFav = teamFavMatches.find(m => ['1H','HT','2H','ET','P','BT'].includes(m.fixture?.status?.short));
        chosenMatch = liveFav || teamFavMatches[0];
        isFavTeam = true;
      }

      // 2. If no favorite team plays today, look for matches in favorite leagues
      if (!chosenMatch) {
        const leagueFavMatches = list.filter(m => isLeagueFavorite(m.league));
        if (leagueFavMatches.length > 0) {
          const liveLeague = leagueFavMatches.find(m => ['1H','HT','2H','ET','P','BT'].includes(m.fixture?.status?.short));
          chosenMatch = liveLeague || leagueFavMatches[0];
        }
      }

      // 3. Fallback: Only show general top live match if user allowed non-favorite fallback
      if (!chosenMatch && settings.only_favs === false) {
        const anyLive = list.find(m => ['1H','HT','2H','ET','P','BT'].includes(m.fixture?.status?.short));
        if (anyLive) chosenMatch = anyLive;
      }
    }
  } catch (err) {
    // Graceful fallback on network timeout
  }

  // If no match related to the user is found today
  if (!chosenMatch) {
    return {
      view: {
        title: "Football Live",
        icon: '⭐',
        big: "No Fav Match",
        sub: t.noGames,
        text: "None of your favorite teams or leagues play today",
        accent: '#94a3b8',
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

  const titleText = isFavTeam ? `⭐ ${t.favMatch}` : t.topMatch;
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
