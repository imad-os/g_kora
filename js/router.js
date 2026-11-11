"use strict";

(function() {
    const { State, API, Helpers } = window.AppServices;
    const Components = window.AppComponents;
    const Utils = window.Utils;

    window.ButtonMapper = {
        listeningSlot: null,
        timer: null,
        countdown: null,
        remainingSecs: 5,

        isListening: function() {
            return this.listeningSlot !== null;
        },

        getFriendlyLabel: function(action) {
            if (!action) return 'Not mapped';
            const a = String(action).toLowerCase();
            if (a === 'pageup' || a === 'rb') return 'R Shoulder (RB)';
            if (a === 'pagedown' || a === 'lb') return 'L Shoulder (LB)';
            if (a === 'run' || a === 'x') return 'Button X';
            if (a === 'y') return 'Button Y';
            if (a === 'confirm' || a === 'ok' || a === 'a') return 'Button A';
            if (a === 'cancel' || a === 'b') return 'Button B';
            if (a === 'right') return 'D-pad Right';
            if (a === 'left') return 'D-pad Left';
            if (a === 'up') return 'D-pad Up';
            if (a === 'down') return 'D-pad Down';
            if (a === 'rt') return 'R Trigger (RT)';
            if (a === 'lt') return 'L Trigger (LT)';
            if (a === 'menu' || a === 'start') return 'Menu / Start';
            if (a === 'select' || a === 'view') return 'Select / View';
            return action.charAt(0).toUpperCase() + action.slice(1);
        },

        startListening: function(slotKey) {
            if (this.listeningSlot) this.cancel();

            this.listeningSlot = slotKey;
            this.remainingSecs = 5;

            const card = document.getElementById(`btn-map-${slotKey}`);
            const badge = document.getElementById(`badge-${slotKey}`);
            if (card) card.classList.add('listening');
            if (badge) {
                badge.classList.add('listening-badge');
                badge.innerHTML = `<span class="listening-pulse">● Listening... <b>${this.remainingSecs}s</b></span>`;
            }

            if (this.countdown) clearInterval(this.countdown);
            this.countdown = setInterval(() => {
                this.remainingSecs--;
                const b = document.getElementById(`badge-${slotKey}`);
                if (b && this.remainingSecs > 0) {
                    b.innerHTML = `<span class="listening-pulse">● Listening... <b>${this.remainingSecs}s</b></span>`;
                }
            }, 1000);

            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.cancel(true);
            }, 5000);

            Helpers.showToast('Press any controller button or key (5s)...', 'info');
        },

        recordInput: async function(rawAction, dev) {
            if (!this.listeningSlot) return;

            const slotKey = this.listeningSlot;
            this.clearTimers();
            this.listeningSlot = null;
            this.lastRecordTime = Date.now();

            const card = document.getElementById(`btn-map-${slotKey}`);
            const badge = document.getElementById(`badge-${slotKey}`);
            if (card) card.classList.remove('listening');
            if (badge) badge.classList.remove('listening-badge');

            // Standardize action code
            let action = rawAction;
            if (rawAction === 'RB' || rawAction === 'PageUp' || rawAction === 'ChannelUp') action = 'pageUp';
            else if (rawAction === 'LB' || rawAction === 'PageDown' || rawAction === 'ChannelDown') action = 'pageDown';
            else if (rawAction === 'X' || rawAction === 'run') action = 'run';
            else if (rawAction === 'Y' || rawAction === 'y') action = 'y';
            else if (rawAction === 'ArrowRight' || rawAction === 'right') action = 'right';
            else if (rawAction === 'ArrowLeft' || rawAction === 'left') action = 'left';
            else if (rawAction === 'ArrowUp' || rawAction === 'up') action = 'up';
            else if (rawAction === 'ArrowDown' || rawAction === 'down') action = 'down';

            if (!State.appConfig.buttonMappings) State.appConfig.buttonMappings = {};
            State.appConfig.buttonMappings[slotKey] = action;

            const friendly = this.getFriendlyLabel(action);
            if (badge) badge.textContent = friendly;

            const user = State.currentUser || {};
            await window.AppServices.Storage.saveUserConfig(user.uid || 'player', State.appConfig);
            Helpers.showToast(`Mapped to ${friendly}`, 'success');

            if (card && window.Navigation) {
                window.Navigation.focus(card);
            }
        },

        cancel: function(isTimeout = false) {
            if (!this.listeningSlot) return;

            const slotKey = this.listeningSlot;
            this.clearTimers();
            this.listeningSlot = null;

            const card = document.getElementById(`btn-map-${slotKey}`);
            const badge = document.getElementById(`badge-${slotKey}`);
            if (card) card.classList.remove('listening');
            if (badge) {
                badge.classList.remove('listening-badge');
                const curr = (State.appConfig?.buttonMappings || {})[slotKey];
                badge.textContent = this.getFriendlyLabel(curr);
            }

            if (isTimeout) {
                Helpers.showToast('Mapping timed out (5s expired)', 'info');
            } else {
                Helpers.showToast('Mapping cancelled', 'info');
            }

            if (card && window.Navigation) {
                window.Navigation.focus(card);
            }
        },

        clearTimers: function() {
            if (this.countdown) { clearInterval(this.countdown); this.countdown = null; }
            if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        }
    };

    window.AppViews = {
        renderHome: async (container) => {
            window.AppState.currentMatchId = null;
            window.AppState.currentTab = null;
            const dateHeader = document.getElementById('date-header-wrapper');
            if (dateHeader) dateHeader.style.display = 'flex';

            const dateStr = Helpers.formatDate(window.AppState.currentDate);
            const displayDate = window.AppState.isLiveMode ? "Live Matches" : (window.AppState.currentDate.toDateString() === new Date().toDateString() ? "Today, " + dateStr : dateStr);
            document.getElementById('date-header').textContent = displayDate;

            const endpoint = window.AppState.isLiveMode ? 'fixtures?live=all' : `fixtures?date=${dateStr}`;
            window.AppState.renderedMatches = [];
            let matches = null;
            if (window.AppState.matchesCache && window.AppState.lastEndpoint === endpoint) matches = window.AppState.matchesCache;
            else {
                container.innerHTML = `<div class="skeleton-row"><div class="skeleton-header"><div class="shimmer"></div></div><div class="skeleton-rail"><div class="skeleton-card"><div class="shimmer"></div></div><div class="skeleton-card"><div class="shimmer"></div></div><div class="skeleton-card"><div class="shimmer"></div></div></div></div>`;
                try {
                    const settingsPromise = !State.hasLoadedSettings ? window.AppServices.Storage.loadGlobalSettings() : Promise.resolve(State.globalSettings);
                    const matchesPromise = API.fetch(endpoint);
                    const [settings, fetchedMatches] = await Promise.all([settingsPromise, matchesPromise]);
                    
                    if (fetchedMatches === null) return; 

                    if (!State.hasLoadedSettings) { State.globalSettings = settings; State.hasLoadedSettings = true; }
                    matches = fetchedMatches; 
                    window.AppState.matchesCache = matches; 
                    window.AppState.lastEndpoint = endpoint;
                } catch (e) { 
                    container.innerHTML = "Error loading matches."; console.error(e); return; 
                }
            }

            try {
                const favTeams = new Set((State.appConfig.favorite_teams || []).map(t => Number(t.id)));
                const favLeagues = new Set((State.appConfig.favorite_leagues || []).map(l => Number(l.id)));
                const allowedLeagues = (State.globalSettings.allowed_leagues && State.globalSettings.allowed_leagues.length > 0)
                    ? State.globalSettings.allowed_leagues
                    : (State.appConfig.allowed_leagues || []);
                const allowedIds = new Set(allowedLeagues.map(l => Number(l.id)));
                const hasRestrictions = allowedIds.size > 0;
                const teamFavorites = []; const leagueMatches = []; 

                matches.forEach(m => {
                    const isFavTeam = favTeams.has(Number(m.teams.home.id)) || favTeams.has(Number(m.teams.away.id)) || Utils.isTracked(m.fixture.id);
                    const isFavLeague = favLeagues.has(Number(m.league.id));
                    const isAllowed = allowedIds.has(Number(m.league.id));
                    if (isFavTeam) teamFavorites.push(m);
                    if (hasRestrictions) {
                        if (isAllowed || isFavLeague || isFavTeam) leagueMatches.push(m);
                    } else {
                        leagueMatches.push(m);
                    }
                });

                const rows = [];
                // Favorites rail: show only when there are favorite matches to display.
                if (teamFavorites.length > 0) {
                    rows.push({ title: "Favorites", matches: teamFavorites, isSpecial: true, isMixed: true });
                }
                
                const liveMatches = [...teamFavorites, ...leagueMatches].filter(m => ['1H','HT','2H','ET','P','BT'].includes(m.fixture.status.short));
                const uniqueLive = Array.from(new Map(liveMatches.map(item => [item.fixture.id, item])).values());
                if (uniqueLive.length > 0) rows.push({ title: "Live Now", matches: uniqueLive, isSpecial: true, isMixed: true });

                const leagueGroups = {};
                leagueMatches.forEach(m => {
                    if (!leagueGroups[m.league.id]) leagueGroups[m.league.id] = { ...m.league, matches: [] };
                    leagueGroups[m.league.id].matches.push(m);
                });

                const sortedKeys = Object.keys(leagueGroups).sort((a, b) => {
                    const isA = favLeagues.has(Number(a)); const isB = favLeagues.has(Number(b));
                    if (isA && !isB) return -1; if (!isA && isB) return 1; return 0;
                });

                let processedKeys = sortedKeys;
                if (!hasRestrictions && !window.AppState.homePageLoadAllState && processedKeys.length > 5) processedKeys = sortedKeys.slice(0, 5);

                const orphanMatches = [];
                processedKeys.forEach(key => {
                    const group = leagueGroups[key];
                    if (favLeagues.has(group.id) || group.matches.length >= 2) rows.push({ title: group.name, matches: group.matches, logo: group.logo, id: group.id, season: group.season, isSpecial: false });
                    else orphanMatches.push(...group.matches);
                });

                if (orphanMatches.length > 0) rows.push({ title: "More Matches", matches: orphanMatches, isSpecial: true, isMixed: true });

                if (rows.length === 0) {
                     container.innerHTML = `<div style="padding:4rem; text-align:center; height:60vh; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                            <h2 style="margin-bottom:1rem;">No Matches Found</h2>
                            <button id="btn-reload-empty" class="styled-button focusable" tabindex="0">Reload</button></div>`;
                     document.getElementById('btn-reload-empty').onclick = () => { window.AppState.matchesCache = null; window.AppViews.renderHome(container); };
                } else {
                    const htmlParts = [];
                    rows.forEach((row, index) => {
                        const headerHtml = row.isSpecial 
                            ? `<div class="row-header-content focusable" tabindex="0"><span>${row.title}</span></div>`
                            : `<a class="row-header-content clickable focusable" tabindex="0" data-action="open-league" data-id="${row.id}" data-season="${row.season}" href="${window.AppRouter && window.AppRouter.href ? window.AppRouter.href('league', { id: row.id, season: row.season }) : `#/league/${row.id}/${row.season || ''}`}">
                                ${row.logo ? Utils.ImageLoader.tag(row.logo, row.title, 'row-league-logo') : ''} <span>${row.title}</span>
                               </a>
                               <div class="fav-toggle focusable ${Helpers.isFav('league', row.id) ? 'active' : ''}" tabindex="0" data-type="league" data-id="${row.id}" data-name="${row.title}">
                                <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                               </div>`;
                        const cardsHtml = (row.matches && row.matches.length)
                            ? row.matches.map(m => {
                                window.AppState.renderedMatches.push(m);
                                return Components.card(m, row.isMixed);
                              }).join('')
                            : `<div class="rail-empty">
                                    <div class="rail-empty-title">No matches</div>
                                    <div class="rail-empty-sub">Try another date or disable Live Only.</div>
                               </div>`;
                        htmlParts.push(`<div class="row-section" data-row-index="${index}"><div class="row-header" style="padding-left:0.5rem;">${headerHtml}</div><div class="rail">${cardsHtml}</div></div>`);
                    });
                    if (!hasRestrictions && !window.AppState.homePageLoadAllState && sortedKeys.length > 5) htmlParts.push(`<div style="text-align:center; padding: 2rem; margin-bottom: 2rem;"><button id="btn-load-all" class="styled-button focusable" tabindex="0">Load All Leagues</button></div>`);
                    container.innerHTML = htmlParts.join('');
                }
                if(document.getElementById('btn-load-all')) document.getElementById('btn-load-all').onclick = () => { window.AppState.matchesCache = null; window.AppState.homePageLoadAllState = true; window.AppViews.renderHome(container); };
                Navigation.scan(true);
                Utils.ImageLoader.scan(container);
            } catch (e) { container.innerHTML = "Error processing matches."; console.error(e); }
        },

        renderDetails: async (container, id) => {
            window.AppState.currentMatchId = parseInt(id) || null;
            window.AppState.currentTab = null;
            const dateHeader = document.getElementById('date-header-wrapper');
            if (dateHeader) dateHeader.style.display = 'none';

            container.innerHTML = `<div class="page-container"><div class="skeleton-detail-header"><div class="shimmer"></div></div><div class="skeleton-detail-tabs"><div class="shimmer"></div></div><div class="skeleton-detail-list"><div class="shimmer"></div></div></div>`;
            try {
                const results = await Promise.all([
                    API.fetch(`fixtures?id=${id}`),
                    API.fetch(`fixtures/events?fixture=${id}`),
                    API.fetch(`fixtures/lineups?fixture=${id}`),
                    API.fetch(`fixtures/statistics?fixture=${id}`),
                    API.fetch(`predictions?fixture=${id}`),
                    API.fetch(`fixtures/players?fixture=${id}`) 
                ]);

                if (results[0] === null) return; 

                const [matchData, events, lineups, stats, predictions, playerStats] = results;

                if (!matchData || matchData.length === 0) throw new Error("Match not found");
                const { fixture, teams, goals, league, score } = matchData[0];
                
                const h2hData = await API.fetch(`fixtures/headtohead?h2h=${teams.home.id}-${teams.away.id}`);
                const isFinished = ['FT', 'AET', 'PEN'].includes(fixture.status.short);
                const isNotStarted = ['NS', 'TBD'].includes(fixture.status.short);
                const isActuallyLive = ['1H','HT','2H','ET','P','BT'].includes(fixture.status.short);
                let tabs = [];
                if (!isFinished) tabs.push({ id: 'track', label: 'Track', show: true, isAction: true });

                const hasPred = predictions && predictions.length > 0;
                if (isNotStarted && hasPred) tabs.push({ id: 'pred', label: 'Predictions', show: true });
                tabs.push({ id: 'ev', label: 'Events', show: events && events.length > 0 });
                tabs.push({ id: 'ln', label: 'Lineups', show: lineups && lineups.length >= 2 });
                tabs.push({ id: 'st', label: 'Stats', show: stats && stats.length >= 2 });
                tabs.push({ id: 'h2h', label: 'H2H', show: h2hData && h2hData.length > 0 });
                if (!isNotStarted && hasPred) tabs.push({ id: 'pred', label: 'Predictions', show: true });
                
                tabs = tabs.filter(t => t.show);
                let activeTabId = tabs.find(t => !t.isAction)?.id;
                if (isNotStarted && hasPred) activeTabId = 'pred';
                else if (events && events.length > 0) activeTabId = 'ev';
                
                const tabsHtml = tabs.map(t => {
                    if (t.isAction) return `<button class="tab-button focusable ${Utils.isTracked(fixture.id) ? 'track-active' : ''}" id="btn-track-toggle" tabindex="0" data-mid="${fixture.id}">Track</button>`;
                    return `<button class="tab-button ${t.id === activeTabId ? 'active' : ''} focusable" data-tab="${t.id}" tabindex="0">${t.label}</button>`;
                }).join('');

                let statusDisplay = fixture.status.long;
                let datestr = Utils.fullDate(fixture.date);
                if (['1H','HT','2H','ET','P','BT'].includes(fixture.status.short)) {
                    const time = fixture.status.short === 'HT' ? 'HT' : (fixture.status.elapsed ? `${Utils.formTimeString(fixture.status)}` : 'LIVE');
                    statusDisplay = `<span class="live-time">${time}</span>`;
                }

                let penaltyDisplay = '';
                if (score.penalty.home !== null && score.penalty.away !== null) penaltyDisplay = `<div style="font-size:1.2rem; color:#aaa; margin-top:0.5rem;">(Pen: ${score.penalty.home} - ${score.penalty.away})</div>`;
                const venue = fixture.venue.city ? `${fixture.venue.city}, ${fixture.venue.name}` : fixture?.venue?.name;
                const homeFav = Helpers.isFav('team', teams.home.id);
                const awayFav = Helpers.isFav('team', teams.away.id);
                const safeHome = String(teams.home.name || '').replace(/"/g, '&quot;');
                const safeAway = String(teams.away.name || '').replace(/"/g, '&quot;');
                const safeHomeLogo = String(teams.home.logo || '').replace(/"/g, '&quot;');
                const safeAwayLogo = String(teams.away.logo || '').replace(/"/g, '&quot;');
                container.innerHTML = `
                    <div class="page-container">
                        <div class="details-hero ${isActuallyLive?'is-live':''}" style="align-items:center; text-align:center;">
                            <div class="details-hero-league">${Utils.ImageLoader.tag(league.logo, league.name, 'league-logo')} <span>${league.name}</span></div>
                            <div class="details-hero-content" style="justify-content:center; padding:0;">
                                <div class="details-team focusable ${homeFav ? 'is-fav' : ''}" tabindex="0" role="button" data-action="toggle-fav-team" data-team-id="${teams.home.id}" data-team-name="${safeHome}" data-team-logo="${safeHomeLogo}">${Utils.ImageLoader.tag(teams.home.logo, teams.home.name, 'team-logo')}<h2>${teams.home.name}</h2><span class="details-team-fav-pill ${homeFav ? 'active' : ''}">${homeFav ? '★ Favorite Team' : '☆ Click / OK to Fav'}</span></div>
                                <div class="details-score-box">
                                    <div class="details-score">${goals.home?? "-"} - ${goals.away?? "-"}</div>
                                    ${penaltyDisplay}
                                    <div class="details-status">${statusDisplay}</div>
                                    <div class="details-date">${datestr}</div>
                                </div>
                                <div class="details-team focusable ${awayFav ? 'is-fav' : ''}" tabindex="0" role="button" data-action="toggle-fav-team" data-team-id="${teams.away.id}" data-team-name="${safeAway}" data-team-logo="${safeAwayLogo}">${Utils.ImageLoader.tag(teams.away.logo, teams.away.name, 'team-logo')}<h2>${teams.away.name}</h2><span class="details-team-fav-pill ${awayFav ? 'active' : ''}">${awayFav ? '★ Favorite Team' : '☆ Click / OK to Fav'}</span></div>
                            </div>
                            <div class="venue">${venue}</div>
                        </div>
                        <div class="tabs">${tabsHtml}</div>
                        <div id="pred" class="tab-content ${activeTabId === 'pred' ? 'active' : ''}">${hasPred ? Components.renderPredictions(predictions[0]) : ''}</div>
                        <div id="ev" class="tab-content ${activeTabId === 'ev' ? 'active' : ''}">${Components.renderEvents(events, teams.home.id)}</div>
                        <div id="ln" class="tab-content ${activeTabId === 'ln' ? 'active' : ''}">${Components.renderLineups(lineups, playerStats)}</div>
                        <div id="st" class="tab-content ${activeTabId === 'st' ? 'active' : ''}">${Components.renderStats(stats)}</div>
                        <div id="h2h" class="tab-content ${activeTabId === 'h2h' ? 'active' : ''}">${Components.renderH2H(h2hData, teams.home, teams.away)}</div>
                    </div>`;
                Navigation.scan(true);
                Utils.ImageLoader.scan(container);
            } catch(e) { 
                container.innerHTML = `<div class="error-message">Error: ${e.message}</div>`; 
                console.error(e);
            }
        },

        renderLeaguePage: async (container, params) => {
            const {id,season} = params;
            const dateHeader = document.getElementById('date-header-wrapper');
            if (dateHeader) dateHeader.style.display = 'none';
            container.innerHTML = `<div class="page-container"><div class="skeleton-detail-header"><div class="shimmer"></div></div><div class="skeleton-detail-tabs"><div class="shimmer"></div></div><div class="skeleton-detail-list"><div class="shimmer"></div></div></div>`;
            try {
                const results = await Promise.all([
                    API.fetch(`standings?league=${id}&season=${season}`),
                    API.fetch(`fixtures?league=${id}&season=${season}`),
                    API.fetch(`players/topscorers?league=${id}&season=${season}`),
                    API.fetch(`players/topassists?league=${id}&season=${season}`)
                ]);
                
                if (results[0] === null && results[1] === null) return; 

                const [standingsData, fixtures, scorers, assists] = results;
                const league = standingsData?.[0]?.league || fixtures?.[0]?.league || scorers?.[0]?.statistics?.[0]?.league;
                if(!league) throw new Error("League unavailable");
                
                window.AppState.currentLeagueStats = { scorers: scorers || [], assists: assists || [] };
                const standings = standingsData?.[0]?.league?.standings || [];
                
                // Knockout tab: detect strictly from fixture rounds (do NOT rely on league.type).
                const knockoutKeywords = ['Round of 16', '8th Finals', 'Quarter-finals', 'Semi-finals', 'Final', 'Match for 3rd place'];
                const knockoutMatches = fixtures ? fixtures.filter(f => {
                    const r = f.league.round || '';
                    return knockoutKeywords.some(k => r.includes(k));
                }) : [];
                const favBtn= `
                <span class="fav-toggle focusable ${Helpers.isFav('league', league.id) ? 'active' : ''}" tabindex="0" data-type="league" data-id="${league.id}" data-name="${league.name}">
                    <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                </span>`;
                const tabs = [
                    { id: 'l-std', label: 'Standings', show: standings && standings.length > 0 },
                    { id: 'l-ko', label: 'Knockout Stage', show: knockoutMatches.length > 0 },
                    { id: 'l-mat', label: 'Matches', show: fixtures && fixtures.length > 0 },
                    { id: 'l-scr', label: 'Top Scorers', show: scorers && scorers.length > 0 },
                    { id: 'l-ast', label: 'Top Assists', show: assists && assists.length > 0 },
                ].filter(t => t.show);
                
                const activeTabId = tabs.length > 0 ? tabs[0].id : null;
                const tabsHtml = tabs.map(t => `<button class="tab-button ${t.id === activeTabId ? 'active' : ''} focusable" data-tab="${t.id}" tabindex="0">${t.label}</button>`).join('');
                
                // Expose current league for quick-actions
                window.AppState.currentLeagueId = Number(id);
                window.AppState.currentLeagueName = league.name;

                container.innerHTML = `
                    <div class="page-container">
                        <div class="details-hero" style="align-items:center; justify-content:center;">
                            ${Utils.ImageLoader.tag(league.logo, league.name, 'league-logo', 'style="height:100px; margin-bottom:1rem;"')}
                            <h1 style="margin:0; font-size:2.5em;">${league.name}</h1>
                        </div>
                        <div class="tabs">${tabsHtml} ${favBtn}</div>
                        <div id="l-std" class="tab-content ${activeTabId === 'l-std' ? 'active' : ''}">${Components.renderStandings(standings)}</div>
                        <div id="l-ko" class="tab-content ${activeTabId === 'l-ko' ? 'active' : ''}">${Components.renderKnockout(knockoutMatches)}</div>
                        <div id="l-mat" class="tab-content ${activeTabId === 'l-mat' ? 'active' : ''}">
                            ${Components.renderMatchesByStage(fixtures, { limit: 220 })}
                        </div>
                        <div id="l-scr" class="tab-content ${activeTabId === 'l-scr' ? 'active' : ''}">${Components.renderPlayerStats(scorers, 'goals')}</div>
                        <div id="l-ast" class="tab-content ${activeTabId === 'l-ast' ? 'active' : ''}">${Components.renderPlayerStats(assists, 'assists')}</div>
                    </div>`;
                Navigation.scan(true);
                Utils.ImageLoader.scan(container);
            } catch(e) { 
                container.innerHTML = `<div class="error-message">Error: ${e.message}</div>`; 
                console.error(e);
            }
        }
        ,

        renderAccountPage: async (container) => {
            window.AppState.currentMatchId = null;
            window.AppState.currentTab = null;
            const dateHeader = document.getElementById('date-header-wrapper');
            if (dateHeader) dateHeader.style.display = 'none';

            if (!State.currentUser) {
                container.innerHTML = `
                    <div class="account-login-page">
                        <h1>Account</h1>
                        <p class="account-login-sub">Sign in to manage favorites.</p>
                        <button id="btn-open-auth" class="styled-button focusable" tabindex="0">Sign In</button>
                    </div>
                `;
                const btn = document.getElementById('btn-open-auth');
                if (btn) btn.onclick = () => window.AppUI && window.AppUI.showModal ? window.AppUI.showModal('auth-modal') : null;
                Navigation.scan();
                return;
            }

            const cfg = State.appConfig || {};
            const favTeams = cfg.favorite_teams || [];
            const favLeagues = cfg.favorite_leagues || [];
            const favPlayers = cfg.favorite_players || [];

                        const section = (title, type, items) => {
                const cards = (items || []).map(it => {
                    const img = it.logo || it.photo || '';
                    const sub = it.country || it.team || '';
                    const safeName = (it.name || 'Unknown').replace(/"/g,'&quot;');

                    if (type === 'team' || type === 'league') {
                        const scopeAttr = type === 'team'
                            ? `data-team-id="${it.id}" data-team-name="${safeName}"`
                            : `data-league-id="${it.id}" data-league-name="${safeName}"`;

                        return `
                            <div class="fav-card">
                                <div class="fav-card-media">
                                    ${img ? Utils.ImageLoader.tag(img, safeName, 'fav-img') : `<div class="fav-placeholder">${safeName.slice(0,1).toUpperCase()}</div>`}
                                </div>
                                <div class="fav-name">${it.name || 'Unknown'}</div>
                                ${sub ? `<div class="fav-sub">${sub}</div>` : ``}

                                <div class="fav-actions">
                                    <button class="fav-icon-btn fav-player-btn focusable" tabindex="0" ${scopeAttr} title="Add Player Favorite">
                                        <i class="ph ph-user"></i>
                                    </button>
                                    <button class="fav-icon-btn fav-remove-btn focusable" tabindex="0" data-type="${type}" data-id="${it.id}" title="Remove Favorite">
                                        <i class="ph ph-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    }

                    return `
                        <div class="fav-card">
                            <div class="fav-card-media">
                                ${img ? Utils.ImageLoader.tag(img, safeName, 'fav-img') : `<div class="fav-placeholder">${safeName.slice(0,1).toUpperCase()}</div>`}
                            </div>
                            <div class="fav-name">${it.name || 'Unknown'}</div>
                            ${sub ? `<div class="fav-sub">${sub}</div>` : ``}

                            <div class="fav-actions">
                                <button class="fav-icon-btn fav-remove-btn focusable" tabindex="0" data-type="${type}" data-id="${it.id}" title="Remove Favorite">
                                    <i class="ph ph-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

                const showAdd = (type !== 'player');

                return `
                    <section class="account-section">
                        <div class="account-section-header">
                            <div class="account-section-title">${title}</div>
                            ${showAdd ? `
                                <button class="add-fav-btn focusable" tabindex="0" data-type="${type}" title="Add Favorite">
                                    <i class="ph ph-plus"></i>
                                </button>
                            ` : ``}
                        </div>
                        <div class="fav-grid">
                            ${cards || `<div class="fav-empty">No favorites yet.</div>`}
                        </div>
                    </section>
                `;
            };

            container.innerHTML = `
                <div class="account-page">
                    <div class="account-hero">
                        <div>
                            <h1>Account</h1>
                            <div class="account-subline">Manage favorites (Teams, Leagues, Players)</div>
                        </div>
                        <button id="btn-account-logout" class="icon-button focusable" tabindex="0" title="Logout">
                            <i class="ph ph-sign-out"></i>
                        </button>
                    </div>

                    ${section('Favorite Teams', 'team', favTeams)}
                    ${section('Favorite Leagues', 'league', favLeagues)}
                    ${section('Favorite Players', 'player', favPlayers)}
                </div>
            `;

            const logoutBtn = document.getElementById('btn-account-logout');
            if (logoutBtn) logoutBtn.onclick = () => window.AppServices.auth.signOut();

            Navigation.scan(true);
            Utils.ImageLoader.scan(container);
        },

        renderFavAddPage: async (container, params) => {
            window.AppState.currentMatchId = null;
            window.AppState.currentTab = null;
            const dateHeader = document.getElementById('date-header-wrapper');
            if (dateHeader) dateHeader.style.display = 'none';

            const type = (params && params.type) ? params.type : 'team';
            const label = type === 'league' ? 'League' : (type === 'player' ? 'Player' : 'Team');

            // Player search in API-Football requires a scope: league or team (with season)
            const scopeTeamId = params && params.teamId ? Number(params.teamId) : null;
            const scopeLeagueId = params && params.leagueId ? Number(params.leagueId) : null;
            const scopeName = params && params.scopeName ? String(params.scopeName) : (params && (params.teamName || params.leagueName) ? String(params.teamName || params.leagueName) : '');

            if (!State.currentUser) {
                container.innerHTML = `
                    <div class="account-login-page">
                        <h1>Add Favorite</h1>
                        <p class="account-login-sub">Sign in to add favorites.</p>
                        <button id="btn-open-auth" class="styled-button focusable" tabindex="0">Sign In</button>
                    </div>
                `;
                const btn = document.getElementById('btn-open-auth');
                if (btn) btn.onclick = () => window.AppUI && window.AppUI.showModal ? window.AppUI.showModal('auth-modal') : null;
                Navigation.scan();
                return;
            }

            container.innerHTML = `
                <div class="fav-add-page">
                    <div class="fav-add-hero">
                        <button class="icon-button focusable" tabindex="0" id="btn-back-fav">
                            <i class="ph ph-arrow-left"></i>
                        </button>
                        <div class="fav-add-title">
                            <div class="fav-add-h1">Add Favorite ${label}</div>
                            <div class="fav-add-h2">${type === 'player' ? (scopeTeamId ? `Searching within Team: ${scopeName || scopeTeamId}` : (scopeLeagueId ? `Searching within League: ${scopeName || scopeLeagueId}` : 'Select a Team or League to search players.')) : 'Use the search box. Press Enter on a result to add.'}</div>
                        </div>
                    </div>

                    <div class="fav-add-search">
                        <input id="fav-search-input" class="focusable" tabindex="0" type="text"
                                placeholder="Search ${label}..." autocomplete="off">
                        <button id="fav-search-btn" class="styled-button focusable" tabindex="0">Search</button>
                    </div>

                    <div id="fav-add-results" class="fav-add-results">
                        <div class="fav-empty">Start typing to search.</div>
                    </div>
                </div>
            `;

            document.getElementById('btn-back-fav').onclick = () => window.AppRouter.back();

            const input = document.getElementById('fav-search-input');
            const btn = document.getElementById('fav-search-btn');
            const resultsEl = document.getElementById('fav-add-results');

            let debounce = null;

            async function doSearch(q) {
                const query = (q || '').trim();
                if (!query) {
                    resultsEl.innerHTML = `<div class="fav-empty">Start typing to search.</div>`;
                    Navigation.scan();
                    return;
                }

                if (query.length < 4) {
                    resultsEl.innerHTML = `<div class=\"fav-empty\">Type at least 4 characters to search.</div>`;
                    Navigation.scan();
                    return;
                }

                resultsEl.innerHTML = `<div class="loader">Searching...</div>`;
                const season = Helpers.getCurrentSeason();
                let endpoint = '';

                if (type === 'league') {
                    endpoint = `leagues?search=${encodeURIComponent(query)}`;
                } else if (type === 'player') {
                    if (scopeTeamId) endpoint = `players?search=${encodeURIComponent(query)}&team=${scopeTeamId}&season=${season}`;
                    else if (scopeLeagueId) endpoint = `players?search=${encodeURIComponent(query)}&league=${scopeLeagueId}&season=${season}`;
                    else {
                        resultsEl.innerHTML = `<div class="fav-empty">Select a Team or League to search players.</div>`;
                        Navigation.scan();
                        return;
                    }
                } else {
                    endpoint = `teams?search=${encodeURIComponent(query)}`;
                }

                const resp = await API.fetch(endpoint);
                if (resp === null) return;

                const items = (resp || []).slice(0, 36).map(r => {
                    if (type === 'league') {
                        return { id: r.league.id, name: r.league.name, logo: r.league.logo, extra: (r.country && r.country.name) ? r.country.name : '' };
                    }
                    if (type === 'player') {
                        const p = r.player || {};
                        const st = (r.statistics && r.statistics[0]) ? r.statistics[0] : {};
                        const team = st.team && st.team.name ? st.team.name : '';
                        return { id: p.id, name: p.name, logo: p.photo, extra: team };
                    }
                    return { id: r.team.id, name: r.team.name, logo: r.team.logo, extra: r.team.country || '' };
                });

                if (!items.length) {
                    resultsEl.innerHTML = `<div class="fav-empty">No results.</div>`;
                    Navigation.scan();
                    return;
                }

                const cards = items.map(it => `
                    <div class="fav-add-card focusable" tabindex="0"
                         data-type="${type}"
                         data-id="${it.id}"
                         data-name="${(it.name||'').replace(/"/g,'&quot;')}"
                         data-logo="${(it.logo||'').replace(/"/g,'&quot;')}"
                         data-extra="${(it.extra||'').replace(/"/g,'&quot;')}">
                        <div class="fav-add-card-media">
                            ${it.logo ? Utils.ImageLoader.tag(it.logo, it.name, 'fav-img') : `<div class="fav-placeholder">${(it.name||'?').slice(0,1).toUpperCase()}</div>`}
                        </div>
                        <div class="fav-add-card-info">
                            <div class="fav-add-card-name">${it.name || 'Unknown'}</div>
                            ${it.extra ? `<div class="fav-add-card-sub">${it.extra}</div>` : ``}
                        </div>
                        <div class="fav-add-card-action"><i class="ph ph-plus-circle"></i></div>
                    </div>
                `).join('');

                resultsEl.innerHTML = `<div class="fav-add-grid">${cards}</div>`;
                Navigation.scan();
                Utils.ImageLoader.scan(resultsEl);
            }

            input.addEventListener('input', () => {
                const q = input.value;
                if (debounce) clearTimeout(debounce);
                debounce = setTimeout(() => doSearch(q), 350);
            });
            btn.onclick = () => doSearch(input.value);

            Navigation.scan();

            setTimeout(() => Navigation.focus(input), 60);
        },

        renderSettingsPage: async (container) => {
            window.AppState.currentMatchId = null;
            window.AppState.currentTab = null;
            const dateHeader = document.getElementById('date-header-wrapper');
            if (dateHeader) dateHeader.style.display = 'none';

            const cfg = window.AppServices.FavoritesService.ensure();
            const mappings = cfg.buttonMappings || {
                dateNext: 'pageUp',
                datePrev: 'pageDown',
                favToggle: 'y',
                trackToggle: 'run'
            };

            const user = window.AppServices.State.currentUser || { name: 'Player', email: 'player@mypc.football', uid: 'player' };

            const SOURCE_META = {
                tracked_matches: {
                    title: 'Tracked Matches',
                    desc: 'Matches you marked with the red Track dot (🔴)',
                    icon: 'ph-Crosshair'
                },
                favorite_teams: {
                    title: 'Favorite Teams',
                    desc: 'Matches featuring your starred Favorite Teams (⭐)',
                    icon: 'ph-star'
                },
                favorite_leagues: {
                    title: 'Favorite Leagues',
                    desc: 'Matches from your hearted Favorite Leagues (❤️)',
                    icon: 'ph-trophy'
                },
                allowed_leagues: {
                    title: 'Allowed Leagues',
                    desc: 'Matches from global allowed competitions (Premier League, La Liga, UCL...)',
                    icon: 'ph-globe-hemisphere-west'
                }
            };

            const API_SOURCES = [
                { id: 'wrapped', label: 'Wrapped API', desc: 'Scores come through the Football Live server (Firebase function footballRequest): it holds the API keys and switches key when one runs out. Its errors are shown as they are.' },
                { id: 'direct', label: 'Direct football-api', desc: 'The TV asks API-Football (api-sports / RapidAPI) itself with the keys built into the app.' }
            ];
            const apiSource = cfg.apiSource === 'direct' ? 'direct' : 'wrapped';
            const lastApiError = (window.FootballClient && window.FootballClient.lastError) || '';

            const MODE_PRESETS = [
                { id: 'fav_teams_only', label: 'Only Favorite Teams' },
                { id: 'tracked_only', label: 'Only Tracked Matches' },
                { id: 'both', label: 'Both (Tracked + Fav Teams)' },
                { id: 'all', label: 'All Sources (By Priority)' }
            ];

            const renderPrioritySection = (targetKey, sectionTitle, sectionIcon, sectionSubtitle) => {
                const block = cfg[targetKey] || {
                    mode: 'both',
                    sources: { tracked_matches: true, favorite_teams: true, favorite_leagues: false, allowed_leagues: false },
                    priority: ['tracked_matches', 'favorite_teams', 'favorite_leagues', 'allowed_leagues']
                };
                const priorityList = Array.isArray(block.priority)
                    ? block.priority
                    : ['tracked_matches', 'favorite_teams', 'favorite_leagues', 'allowed_leagues'];

                const modeBtnsHtml = MODE_PRESETS.map(p => {
                    const isActive = block.mode === p.id;
                    return `<button type="button" class="settings-mode-pill focusable ${isActive ? 'active' : ''}" tabindex="0" data-settings-target="${targetKey}" data-mode="${p.id}">
                        ${isActive ? '● ' : ''}${p.label}
                    </button>`;
                }).join('');

                const priorityRowsHtml = priorityList.map((srcKey, idx) => {
                    const meta = SOURCE_META[srcKey] || { title: srcKey, desc: '' };
                    const isOn = Boolean(block.sources && block.sources[srcKey]);
                    return `
                        <div class="priority-row ${isOn ? 'is-enabled' : 'is-disabled'}" data-source="${srcKey}">
                            <div class="priority-rank">#${idx + 1}</div>
                            <div class="priority-info">
                                <div class="priority-title">${meta.title}</div>
                                <div class="priority-desc">${meta.desc}</div>
                            </div>
                            <div class="priority-actions">
                                <button type="button" class="priority-toggle-btn focusable ${isOn ? 'on' : 'off'}" tabindex="0"
                                        data-settings-target="${targetKey}" data-source-toggle="${srcKey}"
                                        aria-label="Toggle ${meta.title} for ${sectionTitle}">
                                    ${isOn ? 'ON' : 'OFF'}
                                </button>
                                <button type="button" class="priority-move-btn focusable" tabindex="0"
                                        data-settings-target="${targetKey}" data-source-move="${srcKey}" data-dir="-1"
                                        ${idx === 0 ? 'disabled' : ''} title="Move Priority Up" aria-label="Move ${meta.title} priority up">
                                    ▲
                                </button>
                                <button type="button" class="priority-move-btn focusable" tabindex="0"
                                        data-settings-target="${targetKey}" data-source-move="${srcKey}" data-dir="1"
                                        ${idx === priorityList.length - 1 ? 'disabled' : ''} title="Move Priority Down" aria-label="Move ${meta.title} priority down">
                                    ▼
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

                return `
                    <section class="settings-section" id="section-${targetKey}">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.9rem; flex-wrap: wrap; gap: 0.5rem;">
                            <h2 style="font-size: 1.4rem; font-weight: 600; color: var(--bg-focus); margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                                <i class="ph ${sectionIcon}"></i> ${sectionTitle}
                            </h2>
                            <div style="color: var(--text-muted); font-size: 0.9rem;">${sectionSubtitle}</div>
                        </div>

                        <div class="settings-mode-bar">
                            <span class="settings-mode-label">Quick Filter:</span>
                            <div class="settings-mode-pills">${modeBtnsHtml}</div>
                        </div>

                        <div class="priority-list-header">
                            <span>Selection & Priority Order (1st = Highest Priority)</span>
                            <span>Include / Reorder</span>
                        </div>
                        <div class="priority-list">
                            ${priorityRowsHtml}
                        </div>
                    </section>
                `;
            };

            const renderSlot = (slotKey, title, desc) => {
                const action = mappings[slotKey];
                const label = window.ButtonMapper.getFriendlyLabel(action);
                return `
                    <div class="mapping-card focusable" tabindex="0" data-mapping="${slotKey}" id="btn-map-${slotKey}">
                        <div class="mapping-label-group">
                            <div class="mapping-title">${title}</div>
                            <div class="mapping-desc">${desc}</div>
                        </div>
                        <div class="mapping-badge-container">
                            <span class="mapping-badge" id="badge-${slotKey}">${label}</span>
                        </div>
                    </div>
                `;
            };

            container.innerHTML = `
                <div class="settings-page">
                    <div class="settings-hero" style="margin-bottom: 1.8rem;">
                        <h1 style="font-size: 2.2rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.4rem;">Settings</h1>
                        <div style="color: var(--text-muted); font-size: 1.05rem;">Configure Desktop Widget, Background Notification Service priorities & TV Remote / Controller shortcuts</div>
                    </div>

                    ${renderPrioritySection(
                        'widgetSettings',
                        'Desktop Widget Selection & Priority',
                        'ph-squares-four',
                        'Choose which match appears in the My PC Desktop Widget & in what priority order'
                    )}

                    ${renderPrioritySection(
                        'serviceSettings',
                        'Notification Service & Live Alerts Selection',
                        'ph-bell-ringing',
                        'Choose which matches trigger 2-row Goal & Match Result notifications'
                    )}

                    <section class="settings-section" id="section-api-source">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.9rem; flex-wrap: wrap; gap: 0.5rem;">
                            <h2 style="font-size: 1.4rem; font-weight: 600; color: var(--bg-focus); margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                                <i class="ph ph-plugs-connected"></i> Football Data Source
                            </h2>
                            <div style="color: var(--text-muted); font-size: 0.9rem;">Where the app, the widget and the alerts get scores from</div>
                        </div>
                        <div class="settings-mode-bar">
                            <span class="settings-mode-label">Source:</span>
                            <div class="settings-mode-pills">${API_SOURCES.map(p => {
                                const isActive = apiSource === p.id;
                                return `<button type="button" class="settings-mode-pill api-source-pill focusable ${isActive ? 'active' : ''}" tabindex="0" data-api-source="${p.id}" aria-pressed="${isActive}">
                                    ${isActive ? '● ' : ''}${p.label}
                                </button>`;
                            }).join('')}</div>
                        </div>
                        <div class="priority-desc" id="api-source-desc" style="margin-top: 0.6rem;">${(API_SOURCES.find(p => p.id === apiSource) || API_SOURCES[0]).desc}</div>
                        <div class="priority-desc" id="api-source-status" style="margin-top: 0.4rem; color: ${lastApiError ? '#ff6b6b' : '#4cd964'};">${lastApiError ? 'Last request failed: ' + lastApiError.replace(/</g, '&lt;') : 'In use now: ' + (API_SOURCES.find(p => p.id === apiSource) || API_SOURCES[0]).label}</div>
                    </section>

                    <section class="settings-section">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.2rem;">
                            <h2 style="font-size: 1.4rem; font-weight: 600; color: var(--bg-focus); margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                                <i class="ph ph-game-controller"></i> Controller & TV Remote Shortcuts
                            </h2>
                            <div style="color: var(--text-muted); font-size: 0.9rem;">Click or press OK on any action to remap (5s listener)</div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem;">
                            ${renderSlot('dateNext', 'Next Day (+)', 'Advance match date by 1 day')}
                            ${renderSlot('datePrev', 'Previous Day (-)', 'Rewind match date by 1 day')}
                            ${renderSlot('favToggle', 'Toggle Favorite (⭐)', 'Star or unstar team/league on focused card')}
                            ${renderSlot('trackToggle', 'Track Match (🔴 Live Alert)', 'Mark focused match card as tracked with sound & red dot')}
                        </div>

                        <div style="margin-top: 1.5rem; display: flex; gap: 1rem;">
                            <button id="btn-reset-mappings" class="styled-button focusable" style="background: #333; color: #fff;" tabindex="0">
                                <i class="ph ph-arrow-counter-clockwise"></i> Reset to Defaults
                            </button>
                        </div>
                    </section>

                    <section class="settings-section">
                        <h2 style="font-size: 1.4rem; font-weight: 600; color: var(--bg-focus); margin-bottom: 1.2rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="ph ph-user-circle"></i> TV Profile & Automatic Sync
                        </h2>

                        <div style="display: flex; align-items: center; justify-content: space-between; background: #141414; border: 1px solid #333; padding: 1.2rem; border-radius: 8px;">
                            <div>
                                <div style="font-weight: 600; font-size: 1.1rem; color: var(--text-main);">${user.name}</div>
                                <div style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.2rem;">Profile: ${user.email}</div>
                                <div style="color: var(--live-color); font-size: 0.85rem; margin-top: 0.3rem;">● Favorites, Tracked Matches & Widget/Service Priorities Auto-Synced to My PC</div>
                            </div>
                            <div style="font-size: 2rem; color: var(--bg-focus);"><i class="ph ph-cloud-check"></i></div>
                        </div>
                    </section>
                </div>
            `;

            const persistAndRefreshSettings = async (toastMsg, focusSelector) => {
                await window.AppServices.Storage.saveUserConfig(user.uid || 'player', window.AppServices.State.appConfig);
                if (toastMsg) window.AppServices.Helpers.showToast(toastMsg, 'success');
                await window.AppViews.renderSettingsPage(container);
                if (focusSelector) {
                    const targetEl = container.querySelector(focusSelector);
                    if (targetEl && window.Navigation) window.Navigation.focus(targetEl, false);
                }
            };

            // Quick Mode Preset buttons
            container.querySelectorAll('.settings-mode-pill').forEach(btn => {
                btn.onclick = async () => {
                    const targetKey = btn.dataset.settingsTarget;
                    const mode = btn.dataset.mode;
                    if (!targetKey || !mode) return;
                    const block = window.AppServices.State.appConfig[targetKey] || {};
                    block.mode = mode;
                    if (mode === 'fav_teams_only') {
                        block.sources = { tracked_matches: false, favorite_teams: true, favorite_leagues: false, allowed_leagues: false };
                    } else if (mode === 'tracked_only') {
                        block.sources = { tracked_matches: true, favorite_teams: false, favorite_leagues: false, allowed_leagues: false };
                    } else if (mode === 'both') {
                        block.sources = { tracked_matches: true, favorite_teams: true, favorite_leagues: false, allowed_leagues: false };
                    } else if (mode === 'all') {
                        block.sources = { tracked_matches: true, favorite_teams: true, favorite_leagues: true, allowed_leagues: true };
                    }
                    window.AppServices.State.appConfig[targetKey] = block;
                    const sel = `.settings-mode-pill[data-settings-target="${targetKey}"][data-mode="${mode}"]`;
                    await persistAndRefreshSettings(`Updated ${targetKey === 'widgetSettings' ? 'Widget' : 'Notification'} filter mode`, sel);
                };
            });

            // Football data source (Wrapped API / Direct football-api)
            container.querySelectorAll('.api-source-pill').forEach(btn => {
                btn.onclick = async () => {
                    const src = btn.dataset.apiSource === 'direct' ? 'direct' : 'wrapped';
                    window.AppServices.State.appConfig.apiSource = src;
                    if (window.AppState) window.AppState.matchesCache = null; // next Matches page asks the new source
                    if (window.FootballClient) window.FootballClient.setStatus(src, '');
                    const label = (API_SOURCES.find(p => p.id === src) || {}).label || src;
                    await persistAndRefreshSettings(`Football data source: ${label}`, `.api-source-pill[data-api-source="${src}"]`);
                };
            });

            // Per-source ON/OFF toggles
            container.querySelectorAll('.priority-toggle-btn').forEach(btn => {
                btn.onclick = async () => {
                    const targetKey = btn.dataset.settingsTarget;
                    const srcKey = btn.dataset.sourceToggle;
                    if (!targetKey || !srcKey) return;
                    const block = window.AppServices.State.appConfig[targetKey] || {};
                    if (!block.sources) block.sources = {};
                    block.sources[srcKey] = !block.sources[srcKey];

                    // Detect if sources match a preset or custom
                    const s = block.sources;
                    if (!s.tracked_matches && s.favorite_teams && !s.favorite_leagues && !s.allowed_leagues) block.mode = 'fav_teams_only';
                    else if (s.tracked_matches && !s.favorite_teams && !s.favorite_leagues && !s.allowed_leagues) block.mode = 'tracked_only';
                    else if (s.tracked_matches && s.favorite_teams && !s.favorite_leagues && !s.allowed_leagues) block.mode = 'both';
                    else if (s.tracked_matches && s.favorite_teams && s.favorite_leagues && s.allowed_leagues) block.mode = 'all';
                    else block.mode = 'custom';

                    window.AppServices.State.appConfig[targetKey] = block;
                    const sel = `.priority-toggle-btn[data-settings-target="${targetKey}"][data-source-toggle="${srcKey}"]`;
                    await persistAndRefreshSettings(`${SOURCE_META[srcKey]?.title || srcKey}: ${block.sources[srcKey] ? 'Enabled' : 'Disabled'}`, sel);
                };
            });

            // Priority Up / Down buttons
            container.querySelectorAll('.priority-move-btn').forEach(btn => {
                btn.onclick = async () => {
                    const targetKey = btn.dataset.settingsTarget;
                    const srcKey = btn.dataset.sourceMove;
                    const dir = Number(btn.dataset.dir || 0);
                    if (!targetKey || !srcKey || !dir) return;
                    const block = window.AppServices.State.appConfig[targetKey] || {};
                    const arr = Array.isArray(block.priority)
                        ? [...block.priority]
                        : ['tracked_matches', 'favorite_teams', 'favorite_leagues', 'allowed_leagues'];
                    const idx = arr.indexOf(srcKey);
                    const swapIdx = idx + dir;
                    if (idx < 0 || swapIdx < 0 || swapIdx >= arr.length) return;
                    const tmp = arr[idx];
                    arr[idx] = arr[swapIdx];
                    arr[swapIdx] = tmp;
                    block.priority = arr;
                    window.AppServices.State.appConfig[targetKey] = block;
                    const sel = `.priority-move-btn[data-settings-target="${targetKey}"][data-source-move="${srcKey}"][data-dir="${dir}"]`;
                    await persistAndRefreshSettings(`Moved ${SOURCE_META[srcKey]?.title || srcKey} to Priority #${swapIdx + 1}`, sel);
                };
            });

            // Attach click listeners to mapping cards
            ['dateNext', 'datePrev', 'favToggle', 'trackToggle'].forEach(slotKey => {
                const card = document.getElementById(`btn-map-${slotKey}`);
                if (card) {
                    card.onclick = () => {
                        window.ButtonMapper.startListening(slotKey);
                    };
                }
            });

            const btnReset = document.getElementById('btn-reset-mappings');
            if (btnReset) {
                btnReset.onclick = async () => {
                    window.AppServices.State.appConfig.buttonMappings = {
                        dateNext: 'pageUp',
                        datePrev: 'pageDown',
                        favToggle: 'y',
                        trackToggle: 'run'
                    };
                    ['dateNext', 'datePrev', 'favToggle', 'trackToggle'].forEach(slotKey => {
                        const b = document.getElementById(`badge-${slotKey}`);
                        if (b) b.textContent = window.ButtonMapper.getFriendlyLabel(window.AppServices.State.appConfig.buttonMappings[slotKey]);
                    });
                    await window.AppServices.Storage.saveUserConfig(user.uid, window.AppServices.State.appConfig);
                    window.AppServices.Helpers.showToast('Reset to default button mappings', 'info');
                };
            }

            Navigation.scan(true);
        }

    };

    window.AppRouter = {
        stack: [],
        current: { name: 'home', params: null },
        historyEnabled: false,

        isWebLinkMode: function() {
            return document.body.classList.contains('web-mode') || window.location.pathname.includes('/website/');
        },

        href: function(name, params = null) {
            const encode = encodeURIComponent;
            const dateStr = Helpers.formatDate(window.AppState?.currentDate || new Date());
            const query = new URLSearchParams();
            if (name === 'home') {
                query.set('date', dateStr);
                if (window.AppState?.isLiveMode) query.set('live', '1');
                const qs = query.toString();
                return `#/home${qs ? `?${qs}` : ''}`;
            }
            if (name === 'match') return `#/match/${encode(params)}`;
            if (name === 'league') {
                const lid = params && params.id ? params.id : '';
                const season = params && params.season ? params.season : '';
                return `#/league/${encode(lid)}/${encode(season)}`;
            }
            if (name === 'account') return '#/account';
            if (name === 'settings') return '#/settings';
            if (name === 'fav-add') {
                if (params && typeof params === 'object') {
                    Object.keys(params).forEach((k) => {
                        if (params[k] !== null && params[k] !== undefined && params[k] !== '') query.set(k, String(params[k]));
                    });
                }
                const qs = query.toString();
                return `#/fav-add${qs ? `?${qs}` : ''}`;
            }
            return '#/home';
        },

        parseHashRoute: function() {
            const raw = window.location.hash || '#/home';
            const clean = raw.startsWith('#') ? raw.slice(1) : raw;
            const [pathRaw, queryRaw = ''] = clean.split('?');
            const path = (pathRaw || '/home').replace(/^\/+/, '');
            const parts = path.split('/').filter(Boolean);
            const query = new URLSearchParams(queryRaw);
            const route = parts[0] || 'home';

            if (route === 'match' && parts[1]) {
                return { name: 'match', params: decodeURIComponent(parts[1]) };
            }
            if (route === 'league' && parts[1]) {
                const id = decodeURIComponent(parts[1]);
                const season = parts[2] ? decodeURIComponent(parts[2]) : (query.get('season') || '');
                return { name: 'league', params: { id, season } };
            }
            if (route === 'account') return { name: 'account', params: null };
            if (route === 'settings') return { name: 'settings', params: null };
            if (route === 'fav-add') {
                return {
                    name: 'fav-add',
                    params: {
                        type: query.get('type') || 'team',
                        teamId: query.get('teamId') || null,
                        leagueId: query.get('leagueId') || null,
                        scopeName: query.get('scopeName') || ''
                    }
                };
            }
            if (route === 'calendar') return { name: 'home', params: { openCalendar: true } };

            const date = query.get('date');
            if (date && window.AppState) {
                const parsed = new Date(`${date}T00:00:00`);
                if (!Number.isNaN(parsed.getTime())) window.AppState.currentDate = parsed;
            }
            if (window.AppState) window.AppState.isLiveMode = query.get('live') === '1';
            return { name: 'home', params: null };
        },

        applyNavState: function() {
            const targets = [
                { id: 'nav-home', names: new Set(['home', 'match', 'league']) },
                { id: 'nav-auth', names: new Set(['account', 'fav-add']) },
                { id: 'nav-settings', names: new Set(['settings']) }
            ];
            const allItems = document.querySelectorAll('#sidebar .menu-item');
            allItems.forEach((el) => el.classList.remove('active'));
            targets.forEach((t) => {
                if (t.names.has(this.current.name)) {
                    const el = document.getElementById(t.id);
                    if (el) el.classList.add('active');
                }
            });
        },

        enableWebHistory: function() {
            if (this.historyEnabled) return;
            this.historyEnabled = true;
            window.addEventListener('hashchange', () => {
                const parsed = this.parseHashRoute();
                if (!this.current || parsed.name !== this.current.name || JSON.stringify(parsed.params) !== JSON.stringify(this.current.params)) {
                    if (this.current) this.stack.push(this.current);
                    this.current = parsed;
                    this.render();
                }
                if (window.location.hash.startsWith('#/calendar') && window.AppUI?.showModal) {
                    window.AppUI.showModal('date-modal');
                }
            });
        },

        go: function(name, params = null) {
            if (this.isWebLinkMode()) {
                const nextHref = this.href(name, params);
                if (window.location.hash !== nextHref) {
                    window.location.hash = nextHref;
                    return;
                }
            } else {
                this.stack.push(this.current);
            }
            this.current = { name, params };
            this.render();
            // Automatically focus the first focusable element in the new view
            setTimeout(() => {
                const target = document.querySelector('#content-container .focusable');
                if (target && window.Navigation) {
                    window.Navigation.focus(target);
                }
            }, 60);
        },

        back: function() {
            if (this.isWebLinkMode()) {
                if (window.history.length > 1) window.history.back();
                else this.go('home');
                return;
            }
            if (this.stack.length > 0) {
                this.current = this.stack.pop();
                this.render();
                setTimeout(() => {
                    const target = document.querySelector('#content-container .focusable');
                    if (target && window.Navigation) window.Navigation.focus(target);
                }, 60);
            } else if (this.current.name !== 'home') {
                this.go('home');
            } else {
                const sidebar = document.querySelector('#sidebar .active');
                if (sidebar) Navigation.focus(sidebar);
            }
        },

        render: function() {
            if (this.isWebLinkMode()) this.current = this.parseHashRoute();
            this.applyNavState();
            window.AppState.currentMatchId = null;
            window.AppState.currentTab = null;
            const container = document.getElementById('content-container');
            if (this.current.name === 'home') window.AppViews.renderHome(container);
            else if (this.current.name === 'match') window.AppViews.renderDetails(container, this.current.params);
            else if (this.current.name === 'league') window.AppViews.renderLeaguePage(container, this.current.params);
            else if (this.current.name === 'account') window.AppViews.renderAccountPage(container);
            else if (this.current.name === 'fav-add') window.AppViews.renderFavAddPage(container, this.current.params);
            else if (this.current.name === 'settings') window.AppViews.renderSettingsPage(container);
        },

        routeDeepLink: function(rawPath) {
            if (!rawPath) return;
            const clean = String(rawPath).replace(/^football-live:/i, '').replace(/^#?\/+/, '').trim();
            if (!clean) return;
            const parts = clean.split('/').filter(Boolean);
            if (parts[0] === 'match' && parts[1]) {
                this.go('match', parts[1]);
            } else if (parts[0] === 'account' || parts[0] === 'favorites') {
                this.go('account');
            } else if (parts[0] === 'settings') {
                this.go('settings');
            } else if (parts[0] === 'league' && parts[1]) {
                this.go('league', { id: parts[1], season: parts[2] || Helpers.getCurrentSeason() });
            }
        }
    };
})();
