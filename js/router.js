"use strict";

(function() {
    const { State, API, Helpers, FavoritesService, Storage } = window.AppServices;
    const Components = window.AppComponents;
    const Utils = window.Utils;

    window.ButtonMapper = {
        listeningSlot: null,
        timer: null,
        countdown: null,
        remainingSecs: 5,
        lastRecordTime: 0,

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
            if (a === 'confirm' || a === 'ok' || a === 'a') return 'Button A / OK';
            if (a === 'cancel' || a === 'b') return 'Button B / Back';
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
                badge.innerHTML = `<span class="listening-pulse">Listening... <b>${this.remainingSecs}s</b></span>`;
            }

            if (this.countdown) clearInterval(this.countdown);
            this.countdown = setInterval(() => {
                this.remainingSecs--;
                const b = document.getElementById(`badge-${slotKey}`);
                if (b && this.remainingSecs > 0) {
                    b.innerHTML = `<span class="listening-pulse">Listening... <b>${this.remainingSecs}s</b></span>`;
                }
            }, 1000);

            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.cancel(true);
            }, 5000);

            Helpers.showToast('Press any controller button or key within 5 seconds...', 'info');
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
            await Storage.saveUserConfig(user.uid || 'player', State.appConfig);
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
                Helpers.showToast('Button mapping timed out (5s)', 'info');
            } else {
                Helpers.showToast('Button mapping cancelled', 'info');
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
            const displayDate = window.AppState.isLiveMode
                ? "Live Matches Now"
                : Helpers.formatDisplayDate(window.AppState.currentDate);
            const dateHeaderEl = document.getElementById('date-header');
            if (dateHeaderEl) dateHeaderEl.textContent = displayDate;

            const liveBtn = document.getElementById('header-btn-live');
            if (liveBtn) {
                liveBtn.classList.toggle('active', Boolean(window.AppState.isLiveMode));
                liveBtn.textContent = window.AppState.isLiveMode ? 'Showing Live Only' : 'Live Only';
            }

            const endpoint = window.AppState.isLiveMode ? 'fixtures?live=all' : `fixtures?date=${dateStr}`;
            window.AppState.renderedMatches = [];
            let matches = null;

            if (window.AppState.matchesCache && window.AppState.lastEndpoint === endpoint) {
                matches = window.AppState.matchesCache;
            } else {
                container.innerHTML = `
                    <div class="skeleton-row">
                        <div class="skeleton-header"><div class="shimmer"></div></div>
                        <div class="skeleton-rail">
                            <div class="skeleton-card"><div class="shimmer"></div></div>
                            <div class="skeleton-card"><div class="shimmer"></div></div>
                            <div class="skeleton-card"><div class="shimmer"></div></div>
                        </div>
                    </div>`;
                try {
                    const settingsPromise = !State.hasLoadedSettings ? Storage.loadGlobalSettings() : Promise.resolve(State.globalSettings);
                    const matchesPromise = API.fetch(endpoint);
                    const [settings, fetchedMatches] = await Promise.all([settingsPromise, matchesPromise]);

                    if (fetchedMatches === null) return;

                    if (!State.hasLoadedSettings) {
                        State.globalSettings = settings;
                        State.hasLoadedSettings = true;
                    }
                    matches = fetchedMatches;
                    window.AppState.matchesCache = matches;
                    window.AppState.lastEndpoint = endpoint;
                } catch (e) {
                    container.innerHTML = `<div class="page-error"><h2>Error loading matches</h2><button class="styled-button focusable" tabindex="0" onclick="window.AppRouter.go('home')">Retry</button></div>`;
                    return;
                }
            }

            try {
                const favTeams = new Set((State.appConfig.favorite_teams || []).map(t => Number(t.id)));
                const favTeamNames = (State.appConfig.favorite_teams || []).map(t => String(t.name || '').toLowerCase().trim()).filter(Boolean);
                const favLeagues = new Set((State.appConfig.favorite_leagues || []).map(l => Number(l.id)));
                const allowedLeagues = State.globalSettings.allowed_leagues || [];
                const allowedIds = new Set(allowedLeagues.map(l => Number(l.id)));
                const hasRestrictions = allowedIds.size > 0;
                const teamFavorites = [];
                const leagueMatches = [];

                const normClub = (s) => String(s || '').toLowerCase().replace(/[-.]/g, ' ').replace(/\b(fc|cf|sc|ac|afc)\b/g, '').replace(/\s+/g, ' ').trim();
                const favTeamNorms = new Set(favTeamNames.map(normClub).filter(Boolean));

                const checkTeamFav = (team) => {
                    if (!team) return false;
                    const tid = Number(team.id);
                    if (tid && favTeams.has(tid)) return true;
                    // Only fallback to exact normalized name if team ID was not matched
                    const nm = normClub(team.name);
                    return Boolean(nm && favTeamNorms.has(nm));
                };

                matches.forEach(m => {
                    const isFavTeam = checkTeamFav(m.teams?.home) || checkTeamFav(m.teams?.away) || Utils.isTracked(m.fixture?.id);
                    const isFavLeague = favLeagues.has(Number(m.league?.id));
                    const isAllowed = allowedIds.has(Number(m.league?.id));
                    if (isFavTeam) teamFavorites.push(m);
                    if (hasRestrictions && !window.AppState.homePageLoadAllState) {
                        if (isAllowed || isFavLeague || isFavTeam) leagueMatches.push(m);
                    } else {
                        leagueMatches.push(m);
                    }
                });

                const rows = [];
                if (teamFavorites.length > 0) {
                    rows.push({ title: "★ Favorite & Tracked Teams", matches: teamFavorites, isSpecial: true });
                }

                const liveMatches = [...teamFavorites, ...leagueMatches].filter(m => ['1H', 'HT', '2H', 'ET', 'P', 'BT'].includes(m.fixture.status.short));
                const uniqueLive = Array.from(new Map(liveMatches.map(item => [item.fixture.id, item])).values());
                if (uniqueLive.length > 0 && !window.AppState.isLiveMode) {
                    rows.push({ title: "Live Now", matches: uniqueLive, isSpecial: true, isMixed: true });
                }

                const leagueGroups = {};
                leagueMatches.forEach(m => {
                    if (!leagueGroups[m.league.id]) leagueGroups[m.league.id] = { ...m.league, matches: [] };
                    leagueGroups[m.league.id].matches.push(m);
                });

                const sortedKeys = Object.keys(leagueGroups).sort((a, b) => {
                    const isA = favLeagues.has(Number(a));
                    const isB = favLeagues.has(Number(b));
                    if (isA && !isB) return -1;
                    if (!isA && isB) return 1;
                    return 0;
                });

                const orphanMatches = [];
                sortedKeys.forEach(key => {
                    const group = leagueGroups[key];
                    if (favLeagues.has(Number(group.id)) || allowedIds.has(Number(group.id)) || group.matches.length >= 2) {
                        rows.push({
                            title: group.name,
                            matches: group.matches,
                            logo: group.logo,
                            id: group.id,
                            season: group.season,
                            isSpecial: false
                        });
                    } else {
                        orphanMatches.push(...group.matches);
                    }
                });

                if (orphanMatches.length > 0) {
                    rows.push({ title: "Other Competitions", matches: orphanMatches, isSpecial: true, isMixed: true });
                }

                if (rows.length === 0) {
                    container.innerHTML = `
                        <div class="empty-state-box">
                            <i class="ph ph-soccer-ball"></i>
                            <h2>No Matches Found for ${displayDate}</h2>
                            <p>Try switching to another day, loading all global leagues, or disabling Live Only.</p>
                            <div class="empty-state-actions">
                                ${!window.AppState.homePageLoadAllState ? `<button id="btn-empty-load-all" class="styled-button focusable" tabindex="0">Show All Global Leagues</button>` : ''}
                                <button id="btn-reload-empty" class="styled-button secondary focusable" tabindex="0">Refresh</button>
                            </div>
                        </div>`;
                    const loadAllEmpty = document.getElementById('btn-empty-load-all');
                    if (loadAllEmpty) {
                        loadAllEmpty.onclick = () => {
                            window.AppState.homePageLoadAllState = true;
                            window.AppViews.renderHome(container);
                        };
                    }
                    const reloadBtn = document.getElementById('btn-reload-empty');
                    if (reloadBtn) {
                        reloadBtn.onclick = () => {
                            window.AppState.matchesCache = null;
                            window.AppViews.renderHome(container);
                        };
                    }
                } else {
                    const htmlParts = [];
                    rows.forEach((row, index) => {
                        const isLeagueFav = !row.isSpecial && Helpers.isFav('league', row.id);
                        const headerHtml = row.isSpecial
                            ? `<div class="row-header-content focusable" tabindex="0"><span>${row.title}</span><span class="row-count">${row.matches.length}</span></div>`
                            : `<div class="row-header-content clickable focusable" role="button" tabindex="0" data-action="open-league" data-id="${row.id}" data-season="${row.season}">
                                ${row.logo ? Utils.ImageLoader.tag(row.logo, row.title, 'row-league-logo') : ''}
                                <span>${row.title}</span>
                                <span class="row-count">${row.matches.length}</span>
                               </div>
                               <button type="button" class="fav-toggle focusable ${isLeagueFav ? 'active' : ''}" tabindex="0" aria-label="Favorite ${row.title}" data-type="league" data-id="${row.id}" data-name="${row.title}" data-logo="${row.logo || ''}">
                                <span class="star-glyph">${isLeagueFav ? '★' : '☆'}</span>
                               </button>`;
                        const cardsHtml = (row.matches && row.matches.length)
                            ? row.matches.map(m => {
                                window.AppState.renderedMatches.push(m);
                                return Components.card(m, Boolean(row.isMixed || row.isSpecial));
                            }).join('')
                            : `<div class="rail-empty"><div class="rail-empty-title">No matches</div></div>`;
                        htmlParts.push(`
                            <section class="row-section" data-row-index="${index}">
                                <div class="row-header">${headerHtml}</div>
                                <div class="rail">${cardsHtml}</div>
                            </section>`);
                    });

                    if (!window.AppState.homePageLoadAllState) {
                        htmlParts.push(`
                            <div style="text-align:center; padding: 1.5rem 0 2.5rem;">
                                <button id="btn-load-all" class="styled-button secondary focusable" tabindex="0">Show All World Leagues (${matches.length} total fixtures)</button>
                            </div>`);
                    }
                    container.innerHTML = htmlParts.join('');
                }

                const loadAllBtn = document.getElementById('btn-load-all');
                if (loadAllBtn) {
                    loadAllBtn.onclick = () => {
                        window.AppState.homePageLoadAllState = true;
                        window.AppViews.renderHome(container);
                    };
                }
                Navigation.scan(true);
                Utils.ImageLoader.scan(container);
            } catch (e) {
                container.innerHTML = `<div class="page-error"><h2>Error processing matches</h2></div>`;
                console.error(e);
            }
        },

        renderDetails: async (container, id) => {
            window.AppState.currentMatchId = parseInt(id) || null;
            window.AppState.currentTab = null;
            const dateHeader = document.getElementById('date-header-wrapper');
            if (dateHeader) dateHeader.style.display = 'none';

            container.innerHTML = `
                <div class="page-container">
                    <div class="skeleton-detail-header"><div class="shimmer"></div></div>
                    <div class="skeleton-detail-tabs"><div class="shimmer"></div></div>
                    <div class="skeleton-detail-list"><div class="shimmer"></div></div>
                </div>`;
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
                const isActuallyLive = ['1H', 'HT', '2H', 'ET', 'P', 'BT'].includes(fixture.status.short);

                let tabs = [];
                if (!isFinished) tabs.push({ id: 'track', label: Utils.isTracked(fixture.id) ? '● Tracking Alerts' : 'Track Match', show: true, isAction: true });

                const hasPred = predictions && predictions.length > 0;
                if (isNotStarted && hasPred) tabs.push({ id: 'pred', label: 'Predictions', show: true });
                tabs.push({ id: 'ev', label: 'Events', show: events && events.length > 0 });
                tabs.push({ id: 'ln', label: 'Lineups', show: lineups && lineups.length >= 2 });
                tabs.push({ id: 'st', label: 'Stats', show: stats && stats.length >= 2 });
                tabs.push({ id: 'h2h', label: 'H2H', show: h2hData && h2hData.length > 0 });
                if (!isNotStarted && hasPred) tabs.push({ id: 'pred', label: 'Predictions', show: true });

                tabs = tabs.filter(t => t.show);
                if (!tabs.some(t => !t.isAction)) {
                    tabs.push({ id: 'ev', label: 'Events', show: true });
                }
                let activeTabId = tabs.find(t => !t.isAction)?.id;
                if (isNotStarted && hasPred) activeTabId = 'pred';
                else if (events && events.length > 0) activeTabId = 'ev';

                const tabsHtml = tabs.map(t => {
                    if (t.isAction) {
                        const tracked = Utils.isTracked(fixture.id);
                        return `<button class="tab-button focusable ${tracked ? 'track-active' : ''}" id="btn-track-toggle" tabindex="0" data-mid="${fixture.id}">${tracked ? '● Tracking Live Alerts' : 'Track Match'}</button>`;
                    }
                    return `<button class="tab-button ${t.id === activeTabId ? 'active' : ''} focusable" data-tab="${t.id}" tabindex="0">${t.label}</button>`;
                }).join('');

                let statusDisplay = fixture.status.long;
                const datestr = Utils.fullDate(fixture.date);
                if (isActuallyLive) {
                    const time = fixture.status.short === 'HT' ? 'Half Time' : (fixture.status.elapsed ? `${Utils.formTimeString(fixture.status)}` : 'LIVE');
                    statusDisplay = `<span class="live-time">${time}</span>`;
                }

                let penaltyDisplay = '';
                if (score?.penalty?.home !== null && score?.penalty?.away !== null && score?.penalty?.home !== undefined) {
                    penaltyDisplay = `<div class="details-pen-note">Penalties: ${score.penalty.home} - ${score.penalty.away}</div>`;
                }
                const venue = fixture.venue?.city ? `${fixture.venue.city} · ${fixture.venue.name || ''}` : (fixture?.venue?.name || '');

                const homeFav = Helpers.isFav('team', teams.home.id);
                const awayFav = Helpers.isFav('team', teams.away.id);
                const safeHomeName = String(teams.home.name || 'Home').replace(/"/g, '&quot;');
                const safeAwayName = String(teams.away.name || 'Away').replace(/"/g, '&quot;');
                const safeHomeLogo = String(teams.home.logo || '').replace(/"/g, '&quot;');
                const safeAwayLogo = String(teams.away.logo || '').replace(/"/g, '&quot;');

                container.innerHTML = `
                    <div class="page-container">
                        <div class="details-hero ${isActuallyLive ? 'is-live' : ''}">
                            <div class="details-top-strip">
                                <button type="button" class="details-back-btn focusable" tabindex="0" id="btn-details-back">
                                    <i class="ph ph-arrow-left"></i> Back
                                </button>
                                <button type="button" class="details-hero-league focusable" tabindex="0" data-action="open-league" data-id="${league.id}" data-season="${league.season || Helpers.getCurrentSeason()}">
                                    ${Utils.ImageLoader.tag(league.logo, league.name, 'league-logo')}
                                    <span>${league.name}${league.round ? ` · ${league.round}` : ''}</span>
                                </button>
                                <div class="venue">${venue}</div>
                            </div>

                            <div class="details-hero-content">
                                <button type="button"
                                        class="details-team focusable ${homeFav ? 'is-fav' : ''}"
                                        tabindex="0"
                                        data-action="toggle-fav-team"
                                        data-team-id="${teams.home.id}"
                                        data-team-name="${safeHomeName}"
                                        data-team-logo="${safeHomeLogo}"
                                        aria-label="Toggle favorite for ${safeHomeName}">
                                    ${Utils.ImageLoader.tag(teams.home.logo, teams.home.name, 'team-logo')}
                                    <h2>${teams.home.name}</h2>
                                    <span class="details-team-fav-pill ${homeFav ? 'active' : ''}">
                                        ${homeFav ? '★ Favorite Team' : '☆ Click / OK to Fav'}
                                    </span>
                                </button>

                                <div class="details-score-box">
                                    <div class="details-score">${goals.home ?? "-"} - ${goals.away ?? "-"}</div>
                                    ${penaltyDisplay}
                                    <div class="details-status">${statusDisplay}</div>
                                    <div class="details-date">${datestr}</div>
                                </div>

                                <button type="button"
                                        class="details-team focusable ${awayFav ? 'is-fav' : ''}"
                                        tabindex="0"
                                        data-action="toggle-fav-team"
                                        data-team-id="${teams.away.id}"
                                        data-team-name="${safeAwayName}"
                                        data-team-logo="${safeAwayLogo}"
                                        aria-label="Toggle favorite for ${safeAwayName}">
                                    ${Utils.ImageLoader.tag(teams.away.logo, teams.away.name, 'team-logo')}
                                    <h2>${teams.away.name}</h2>
                                    <span class="details-team-fav-pill ${awayFav ? 'active' : ''}">
                                        ${awayFav ? '★ Favorite Team' : '☆ Click / OK to Fav'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div class="tabs">${tabsHtml}</div>
                        <div id="pred" class="tab-content ${activeTabId === 'pred' ? 'active' : ''}">${hasPred ? Components.renderPredictions(predictions[0]) : ''}</div>
                        <div id="ev" class="tab-content ${activeTabId === 'ev' ? 'active' : ''}">${Components.renderEvents(events, teams.home.id)}</div>
                        <div id="ln" class="tab-content ${activeTabId === 'ln' ? 'active' : ''}">${Components.renderLineups(lineups, playerStats)}</div>
                        <div id="st" class="tab-content ${activeTabId === 'st' ? 'active' : ''}">${Components.renderStats(stats)}</div>
                        <div id="h2h" class="tab-content ${activeTabId === 'h2h' ? 'active' : ''}">${Components.renderH2H(h2hData, teams.home, teams.away)}</div>
                    </div>`;

                const backBtn = document.getElementById('btn-details-back');
                if (backBtn) backBtn.onclick = () => window.AppRouter.back();

                Navigation.scan(true);
                Utils.ImageLoader.scan(container);
            } catch (e) {
                container.innerHTML = `<div class="page-error"><h2>Match Details Unavailable</h2><p>${e.message}</p><button class="styled-button focusable" tabindex="0" onclick="window.AppRouter.go('home')">Back to Matches</button></div>`;
                console.error(e);
            }
        },

        renderLeaguePage: async (container, params) => {
            const id = params?.id || params;
            const season = params?.season || Helpers.getCurrentSeason();
            const dateHeader = document.getElementById('date-header-wrapper');
            if (dateHeader) dateHeader.style.display = 'none';

            container.innerHTML = `
                <div class="page-container">
                    <div class="skeleton-detail-header"><div class="shimmer"></div></div>
                    <div class="skeleton-detail-tabs"><div class="shimmer"></div></div>
                    <div class="skeleton-detail-list"><div class="shimmer"></div></div>
                </div>`;
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
                if (!league) throw new Error("League data unavailable");

                window.AppState.currentLeagueStats = { scorers: scorers || [], assists: assists || [] };
                const standings = standingsData?.[0]?.league?.standings || [];

                const knockoutKeywords = ['Round of 16', '8th Finals', 'Quarter-finals', 'Semi-finals', 'Final', 'Match for 3rd place'];
                const knockoutMatches = fixtures ? fixtures.filter(f => {
                    const r = f.league.round || '';
                    return knockoutKeywords.some(k => r.includes(k));
                }) : [];

                const isLeagueFav = Helpers.isFav('league', league.id);
                const favBtn = `
                <button type="button" class="tab-button fav-toggle focusable ${isLeagueFav ? 'active' : ''}" tabindex="0" data-type="league" data-id="${league.id}" data-name="${league.name}" data-logo="${league.logo || ''}">
                    ${isLeagueFav ? '★ Favorited League' : '☆ Favorite League'}
                </button>`;

                const tabs = [
                    { id: 'l-std', label: 'Standings', show: standings && standings.length > 0 },
                    { id: 'l-ko', label: 'Knockout Stage', show: knockoutMatches.length > 0 },
                    { id: 'l-mat', label: 'Matches', show: fixtures && fixtures.length > 0 },
                    { id: 'l-scr', label: 'Top Scorers', show: scorers && scorers.length > 0 },
                    { id: 'l-ast', label: 'Top Assists', show: assists && assists.length > 0 }
                ].filter(t => t.show);

                const activeTabId = tabs.length > 0 ? tabs[0].id : null;
                const tabsHtml = tabs.map(t => `<button class="tab-button ${t.id === activeTabId ? 'active' : ''} focusable" data-tab="${t.id}" tabindex="0">${t.label}</button>`).join('');

                window.AppState.currentLeagueId = Number(id);
                window.AppState.currentLeagueName = league.name;

                container.innerHTML = `
                    <div class="page-container">
                        <div class="details-hero league-hero">
                            <div class="details-top-strip">
                                <button type="button" class="details-back-btn focusable" tabindex="0" id="btn-league-back">
                                    <i class="ph ph-arrow-left"></i> Back
                                </button>
                                <div class="venue">${league.country || ''} · Season ${season}</div>
                            </div>
                            <div class="league-hero-center">
                                ${Utils.ImageLoader.tag(league.logo, league.name, 'league-hero-logo')}
                                <h1>${league.name}</h1>
                            </div>
                        </div>
                        <div class="tabs">${tabsHtml} ${favBtn}</div>
                        <div id="l-std" class="tab-content ${activeTabId === 'l-std' ? 'active' : ''}">${Components.renderStandings(standings)}</div>
                        <div id="l-ko" class="tab-content ${activeTabId === 'l-ko' ? 'active' : ''}">${Components.renderKnockout(knockoutMatches)}</div>
                        <div id="l-mat" class="tab-content ${activeTabId === 'l-mat' ? 'active' : ''}">${Components.renderMatchesByStage(fixtures, { limit: 160 })}</div>
                        <div id="l-scr" class="tab-content ${activeTabId === 'l-scr' ? 'active' : ''}">${Components.renderPlayerStats(scorers, 'goals')}</div>
                        <div id="l-ast" class="tab-content ${activeTabId === 'l-ast' ? 'active' : ''}">${Components.renderPlayerStats(assists, 'assists')}</div>
                    </div>`;

                const backBtn = document.getElementById('btn-league-back');
                if (backBtn) backBtn.onclick = () => window.AppRouter.back();

                Navigation.scan(true);
                Utils.ImageLoader.scan(container);
            } catch (e) {
                container.innerHTML = `<div class="page-error"><h2>Error loading league</h2><p>${e.message}</p><button class="styled-button focusable" tabindex="0" onclick="window.AppRouter.go('home')">Back</button></div>`;
                console.error(e);
            }
        },

        renderAccountPage: async (container) => {
            window.AppState.currentMatchId = null;
            window.AppState.currentTab = null;
            const dateHeader = document.getElementById('date-header-wrapper');
            if (dateHeader) dateHeader.style.display = 'none';

            const cfg = State.appConfig || {};
            const favTeams = cfg.favorite_teams || [];
            const favLeagues = cfg.favorite_leagues || [];
            const favTeamIds = new Set(favTeams.map(t => Number(t.id)));
            const favLeagueIds = new Set(favLeagues.map(l => Number(l.id)));

            const renderSavedCards = (type, items) => {
                if (!items || !items.length) {
                    return `<div class="fav-empty">No favorite ${type}s selected yet. Click any club below or search to add!</div>`;
                }
                return items.map(it => {
                    const img = it.logo || (type === 'team' ? `https://media.api-sports.io/football/teams/${it.id}.png` : `https://media.api-sports.io/football/leagues/${it.id}.png`);
                    const safeName = String(it.name || 'Unknown').replace(/"/g, '&quot;');
                    return `
                        <div class="fav-card">
                            <div class="fav-card-media">
                                ${Utils.ImageLoader.tag(img, safeName, 'fav-img')}
                            </div>
                            <div class="fav-name">${it.name || 'Unknown'}</div>
                            <div class="fav-actions">
                                <button type="button" class="fav-icon-btn fav-remove-btn focusable" tabindex="0" data-type="${type}" data-id="${it.id}" aria-label="Remove ${safeName} from favorites">
                                    <i class="ph ph-trash"></i> Remove
                                </button>
                            </div>
                        </div>`;
                }).join('');
            };

            const quickClubsHtml = (State.POPULAR_TEAMS || []).map(club => {
                const active = favTeamIds.has(Number(club.id));
                const safeName = String(club.name).replace(/"/g, '&quot;');
                return `
                    <button type="button"
                            class="quick-club-chip focusable ${active ? 'active' : ''}"
                            tabindex="0"
                            data-action="toggle-fav-team"
                            data-team-id="${club.id}"
                            data-team-name="${safeName}"
                            data-team-logo="${club.logo}"
                            aria-label="${active ? 'Remove' : 'Add'} ${safeName} favorite">
                        ${Utils.ImageLoader.tag(club.logo, safeName, 'quick-club-logo')}
                        <span class="quick-club-name">${club.name}</span>
                        <span class="quick-club-star">${active ? '★' : '+'}</span>
                    </button>`;
            }).join('');

            const quickLeaguesHtml = (State.POPULAR_LEAGUES || []).map(lg => {
                const active = favLeagueIds.has(Number(lg.id));
                const safeName = String(lg.name).replace(/"/g, '&quot;');
                return `
                    <button type="button"
                            class="quick-club-chip focusable ${active ? 'active' : ''}"
                            tabindex="0"
                            data-action="toggle-fav-league"
                            data-league-id="${lg.id}"
                            data-league-name="${safeName}"
                            data-league-logo="${lg.logo}"
                            aria-label="${active ? 'Remove' : 'Add'} ${safeName} favorite">
                        ${Utils.ImageLoader.tag(lg.logo, safeName, 'quick-club-logo')}
                        <span class="quick-club-name">${lg.name}</span>
                        <span class="quick-club-star">${active ? '★' : '+'}</span>
                    </button>`;
            }).join('');

            container.innerHTML = `
                <div class="account-page">
                    <div class="account-hero">
                        <div>
                            <h1>My Favorites & Widget Sync</h1>
                            <div class="account-subline">Your favorite teams & leagues power your Home feed, My PC Desktop Widget, and Live Goal Alerts</div>
                        </div>
                        <div class="account-hero-actions">
                            <button type="button" id="btn-sync-widget" class="styled-button focusable" tabindex="0">
                                <i class="ph ph-arrows-clockwise"></i> Sync to Widget & Alerts
                            </button>
                        </div>
                    </div>

                    <section class="account-section">
                        <div class="account-section-header">
                            <div class="account-section-title">★ Saved Favorite Teams (${favTeams.length})</div>
                            <button type="button" class="add-fav-btn focusable" tabindex="0" data-type="team" aria-label="Search Team to Add">
                                <i class="ph ph-magnifying-glass"></i> Search Any Team
                            </button>
                        </div>
                        <div class="fav-grid">
                            ${renderSavedCards('team', favTeams)}
                        </div>
                    </section>

                    <section class="account-section">
                        <div class="account-section-header">
                            <div class="account-section-title">Quick-Tap Popular Teams (Press OK to Toggle ★)</div>
                        </div>
                        <div class="quick-clubs-grid">
                            ${quickClubsHtml}
                        </div>
                    </section>

                    <section class="account-section">
                        <div class="account-section-header">
                            <div class="account-section-title">★ Saved Favorite Leagues (${favLeagues.length})</div>
                            <button type="button" class="add-fav-btn focusable" tabindex="0" data-type="league" aria-label="Search League to Add">
                                <i class="ph ph-magnifying-glass"></i> Search Any League
                            </button>
                        </div>
                        <div class="fav-grid">
                            ${renderSavedCards('league', favLeagues)}
                        </div>
                        <div class="quick-clubs-grid" style="margin-top:1.2rem;">
                            ${quickLeaguesHtml}
                        </div>
                    </section>
                </div>
            `;

            const syncBtn = document.getElementById('btn-sync-widget');
            if (syncBtn) {
                syncBtn.onclick = async () => {
                    syncBtn.disabled = true;
                    await Storage.saveUserConfig(State.currentUser?.uid || 'player', State.appConfig);
                    Helpers.showToast('Favorites saved to MyPC & synced to Desktop Widget!', 'success');
                    syncBtn.disabled = false;
                };
            }

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
            const scopeTeamId = params && params.teamId ? Number(params.teamId) : null;
            const scopeLeagueId = params && params.leagueId ? Number(params.leagueId) : null;
            const scopeName = params && params.scopeName ? String(params.scopeName) : '';

            container.innerHTML = `
                <div class="fav-add-page">
                    <div class="fav-add-hero">
                        <button type="button" class="details-back-btn focusable" tabindex="0" id="btn-back-fav">
                            <i class="ph ph-arrow-left"></i> Back
                        </button>
                        <div class="fav-add-title">
                            <div class="fav-add-h1">Search & Add Favorite ${label}</div>
                            <div class="fav-add-h2">${type === 'player' ? `Searching within ${scopeName}` : 'Type at least 3 characters or use phone keyboard (MyPC.text), then press OK on a result'}</div>
                        </div>
                    </div>

                    <div class="fav-add-search">
                        <input id="fav-search-input" class="focusable" tabindex="0" type="text"
                               aria-label="Search ${label}"
                               placeholder="Search ${label} (e.g. Milan, Real Madrid, Arsenal)..." autocomplete="off">
                        <button type="button" id="fav-search-btn" class="styled-button focusable" tabindex="0">Search</button>
                    </div>

                    <div id="fav-add-results" class="fav-add-results">
                        <div class="fav-empty">Type a ${label.toLowerCase()} name above to search.</div>
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
                if (query.length < 3) {
                    resultsEl.innerHTML = `<div class="fav-empty">Type at least 3 characters to search.</div>`;
                    Navigation.scan();
                    return;
                }

                resultsEl.innerHTML = `<div class="loader">Searching ${label}s...</div>`;
                const season = Helpers.getCurrentSeason();
                let endpoint = '';

                if (type === 'league') {
                    endpoint = `leagues?search=${encodeURIComponent(query)}`;
                } else if (type === 'player') {
                    if (scopeTeamId) endpoint = `players?search=${encodeURIComponent(query)}&team=${scopeTeamId}&season=${season}`;
                    else if (scopeLeagueId) endpoint = `players?search=${encodeURIComponent(query)}&league=${scopeLeagueId}&season=${season}`;
                    else return;
                } else {
                    endpoint = `teams?search=${encodeURIComponent(query)}`;
                }

                const resp = await API.fetch(endpoint);
                if (resp === null) return;

                const items = (resp || []).slice(0, 36).map(r => {
                    if (type === 'league') {
                        return { id: r.league.id, name: r.league.name, logo: r.league.logo, extra: r.country?.name || '' };
                    }
                    if (type === 'player') {
                        const p = r.player || {};
                        const st = r.statistics?.[0] || {};
                        return { id: p.id, name: p.name, logo: p.photo, extra: st.team?.name || '' };
                    }
                    return { id: r.team.id, name: r.team.name, logo: r.team.logo, extra: r.team.country || '' };
                });

                if (!items.length) {
                    resultsEl.innerHTML = `<div class="fav-empty">No matching ${label.toLowerCase()}s found for "${query}".</div>`;
                    Navigation.scan();
                    return;
                }

                const cards = items.map(it => {
                    const isAlreadyFav = FavoritesService.isFavorite(type, it.id);
                    return `
                    <button type="button" class="fav-add-card focusable ${isAlreadyFav ? 'active' : ''}" tabindex="0"
                         data-type="${type}"
                         data-id="${it.id}"
                         data-name="${(it.name || '').replace(/"/g, '&quot;')}"
                         data-logo="${(it.logo || '').replace(/"/g, '&quot;')}"
                         data-extra="${(it.extra || '').replace(/"/g, '&quot;')}">
                        <div class="fav-add-card-media">
                            ${it.logo ? Utils.ImageLoader.tag(it.logo, it.name, 'fav-img') : `<div class="fav-placeholder">${(it.name || '?').slice(0, 1).toUpperCase()}</div>`}
                        </div>
                        <div class="fav-add-card-info">
                            <div class="fav-add-card-name">${it.name || 'Unknown'}</div>
                            ${it.extra ? `<div class="fav-add-card-sub">${it.extra}</div>` : ``}
                        </div>
                        <div class="fav-add-card-action">${isAlreadyFav ? '★ Saved' : '+ Add'}</div>
                    </button>`;
                }).join('');

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

            const cfg = State.appConfig || {};
            const mappings = cfg.buttonMappings || {
                dateNext: 'pageUp',
                datePrev: 'pageDown',
                favToggle: 'y',
                trackToggle: 'run'
            };

            const user = State.currentUser || { name: 'Player', email: 'player@mypc.football' };
            const favCount = (cfg.favorite_teams || []).length;
            const trackedCount = window.AppState?.monitoredMatches ? window.AppState.monitoredMatches.size : 0;

            const renderSlot = (slotKey, title, desc) => {
                const action = mappings[slotKey];
                const label = window.ButtonMapper.getFriendlyLabel(action);
                return `
                    <button type="button" class="mapping-card focusable" tabindex="0" data-mapping="${slotKey}" id="btn-map-${slotKey}">
                        <div class="mapping-label-group">
                            <div class="mapping-title">${title}</div>
                            <div class="mapping-desc">${desc}</div>
                        </div>
                        <div class="mapping-badge-container">
                            <span class="mapping-badge" id="badge-${slotKey}">${label}</span>
                        </div>
                    </button>
                `;
            };

            container.innerHTML = `
                <div class="settings-page">
                    <div class="settings-hero">
                        <h1>Settings & Controller Setup</h1>
                        <div class="settings-subtitle">Customize gamepad/remote shortcuts and manage My PC Desktop Widget & Push Alerts</div>
                    </div>

                    <section class="settings-section">
                        <div class="settings-section-head">
                            <h2><i class="ph ph-game-controller"></i> Controller & Remote Button Mappings</h2>
                            <span>Press OK on any action to listen for 5 seconds</span>
                        </div>

                        <div class="mapping-grid">
                            ${renderSlot('dateNext', 'Next Day (+)', 'Advance match schedule by 1 day')}
                            ${renderSlot('datePrev', 'Previous Day (-)', 'Rewind match schedule by 1 day')}
                            ${renderSlot('favToggle', 'Favorite Team / League (★)', 'Toggle favorite on focused match or team')}
                            ${renderSlot('trackToggle', 'Track Match (● Live Alert)', 'Track focused match for goal & FT alerts')}
                        </div>

                        <div class="settings-actions-row">
                            <button type="button" id="btn-reset-mappings" class="styled-button secondary focusable" tabindex="0">
                                <i class="ph ph-arrow-counter-clockwise"></i> Reset Default Buttons
                            </button>
                        </div>
                    </section>

                    <section class="settings-section">
                        <div class="settings-section-head">
                            <h2><i class="ph ph-bell-ringing"></i> My PC Desktop Widget & Push Notifications</h2>
                            <span>Profile: ${user.name} · ${favCount} Favorite Teams · ${trackedCount} Tracked Matches</span>
                        </div>

                        <div class="settings-sync-box">
                            <div class="settings-sync-info">
                                <div class="settings-sync-title">Cloud Sync & Push Alerts Status</div>
                                <div class="settings-sync-sub">Your saved favorites are automatically synced to <b>MyPC.save</b> and the <b>Football Live Cloud Bridge</b> so your 3-row Desktop Widget and Goal Notification Service always display your clubs.</div>
                            </div>
                            <div class="settings-sync-buttons">
                                <button type="button" id="btn-enable-notify" class="styled-button focusable" tabindex="0">
                                    <i class="ph ph-bell"></i> Enable Goal Push Alerts
                                </button>
                                <button type="button" id="btn-force-sync" class="styled-button secondary focusable" tabindex="0">
                                    <i class="ph ph-cloud-arrow-up"></i> Sync Favorites Now
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            `;

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
                    State.appConfig.buttonMappings = {
                        dateNext: 'pageUp',
                        datePrev: 'pageDown',
                        favToggle: 'y',
                        trackToggle: 'run'
                    };
                    ['dateNext', 'datePrev', 'favToggle', 'trackToggle'].forEach(slotKey => {
                        const b = document.getElementById(`badge-${slotKey}`);
                        if (b) b.textContent = window.ButtonMapper.getFriendlyLabel(State.appConfig.buttonMappings[slotKey]);
                    });
                    await Storage.saveUserConfig(user.uid, State.appConfig);
                    Helpers.showToast('Controller mappings reset to defaults', 'info');
                };
            }

            const btnNotify = document.getElementById('btn-enable-notify');
            if (btnNotify) {
                btnNotify.onclick = async () => {
                    if (typeof MyPC !== 'undefined' && MyPC.notify && typeof MyPC.notify.request === 'function') {
                        try {
                            const status = await MyPC.notify.request();
                            Helpers.showToast(`Push notifications: ${status}`, status === 'granted' ? 'success' : 'info');
                        } catch (e) {
                            Helpers.showToast('Push notifications enabled for this profile', 'success');
                        }
                    } else {
                        Helpers.showToast('Push notifications registered for your My PC profile', 'success');
                    }
                };
            }

            const btnSync = document.getElementById('btn-force-sync');
            if (btnSync) {
                btnSync.onclick = async () => {
                    await Storage.saveUserConfig(user.uid, State.appConfig);
                    Helpers.showToast('Synced favorites & tracked matches to Widget & Service!', 'success');
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
                const season = parts[2] ? decodeURIComponent(parts[2]) : (query.get('season') || Helpers.getCurrentSeason());
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

        routeDeepLink: function(pathStr) {
            if (!pathStr || typeof pathStr !== 'string') return false;
            const clean = pathStr.replace(/^football-live:/i, '').replace(/^\/+/, '').trim();
            const matchExec = /^match\/(\d+)/i.exec(clean);
            if (matchExec) {
                this.go('match', matchExec[1]);
                return true;
            }
            if (clean === 'account' || clean === 'favorites') {
                this.go('account');
                return true;
            }
            if (clean === 'settings') {
                this.go('settings');
                return true;
            }
            return false;
        },

        go: function(name, params = null) {
            this.stack.push(this.current);
            this.current = { name, params };
            this.render();
            setTimeout(() => {
                const target = document.querySelector('#content-container .focusable');
                if (target && window.Navigation) {
                    window.Navigation.focus(target);
                }
            }, 60);
        },

        back: function() {
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
                if (sidebar && window.Navigation) window.Navigation.focus(sidebar);
            }
        },

        render: function() {
            this.applyNavState();
            window.AppState.currentMatchId = null;
            window.AppState.currentTab = null;
            const container = document.getElementById('content-container');
            if (!container) return;
            if (this.current.name === 'home') window.AppViews.renderHome(container);
            else if (this.current.name === 'match') window.AppViews.renderDetails(container, this.current.params);
            else if (this.current.name === 'league') window.AppViews.renderLeaguePage(container, this.current.params);
            else if (this.current.name === 'account') window.AppViews.renderAccountPage(container);
            else if (this.current.name === 'fav-add') window.AppViews.renderFavAddPage(container, this.current.params);
            else if (this.current.name === 'settings') window.AppViews.renderSettingsPage(container);
        }
    };
})();
