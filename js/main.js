"use strict";

(function() {
    if (!window.AppServices) { console.error("AppServices not loaded!"); return; }

    const { State, API, Storage, Helpers, FavoritesService } = window.AppServices;
    const Components = window.AppComponents;
    const Utils = window.Utils;

    window.AppState = {
        currentDate: new Date(),
        isLiveMode: false,
        homePageLoadAllState: false,
        matchesCache: null,
        lastEndpoint: null,
        currentLeagueStats: { scorers: [], assists: [] },
        currentTab: null,
        currentMatchId: null,
        monitoredMatches: new Set(),
        matchStates: {},
        renderedMatches: []
    };

    const MS_LiveCheck = 30000;
    let MS_left = MS_LiveCheck;
    let liveCheckTimer = null;
    let progressTimer = null;

    // Tracked matches and favorites are loaded in onInit (Storage.loadUserConfig): My PC's user data is ready only then.

    function startLiveTimers() {
        if (!liveCheckTimer) {
            liveCheckTimer = setInterval(() => {
                MS_left = MS_LiveCheck;
                checkLiveMatches();
            }, MS_LiveCheck);
        }
        if (!progressTimer) {
            progressTimer = setInterval(() => {
                MS_left = MS_left >= 1000 ? MS_left - 1000 : 0;
                const percent = parseInt((MS_left / MS_LiveCheck) * 100);
                const bar = document.querySelector("#refreshTimer .progress-fill");
                if (bar) bar.style.width = `${percent}%`;
            }, 1000);
        }
    }

    function stopLiveTimers() {
        if (liveCheckTimer) { clearInterval(liveCheckTimer); liveCheckTimer = null; }
        if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    }

    function removeTrackedMatch(mid, cards = null) {
        if (Utils && Utils.isTracked(mid)) {
            Utils.removeTracked(mid);
            const _cards = cards || document.querySelectorAll(`#match-card-${mid}`);
            if (_cards && _cards.length) {
                for (const card of _cards) {
                    const dot = card.querySelector('.track-indicator');
                    if (dot) dot.remove();
                }
            }
        }
    }

    function showAlert(title, desc, matchData, type, isSilent = false) {
        if (!isSilent && Utils && Utils.playSound) Utils.playSound(type);
        if (document.hidden) return;

        const alertEl = document.getElementById('live-alert');
        if (!alertEl) return;

        const homeScore = matchData.goals.home ?? 0;
        const awayScore = matchData.goals.away ?? 0;

        alertEl.innerHTML = `
            <div class="alert-header"><span class="alert-event-type">${title}</span><span class="alert-time">${Utils ? Utils.formTimeString(matchData.fixture.status) : ''}</span></div>
            <div class="alert-teams">
                <div class="alert-team"><img src="${matchData.teams.home.logo}" alt="${matchData.teams.home.name}"><span>${matchData.teams.home.name}</span></div>
                <div class="alert-score-board">${homeScore} - ${awayScore}</div>
                <div class="alert-team"><img src="${matchData.teams.away.logo}" alt="${matchData.teams.away.name}"><span>${matchData.teams.away.name}</span></div>
            </div>
            <div class="alert-desc">${desc}</div>
        `;

        alertEl.style.display = 'flex';
        void alertEl.offsetWidth;
        alertEl.classList.add('visible');
        if (!isSilent && window.Navigation) window.Navigation.focus(alertEl, false);

        const closeAlert = () => {
            alertEl.classList.remove('visible');
            setTimeout(() => { alertEl.style.display = 'none'; }, 250);
        };
        alertEl.onclick = () => { window.AppRouter.go('match', matchData.fixture.id); closeAlert(); };
        setTimeout(closeAlert, 9000);
        if (window.AppState.currentMatchId === matchData.fixture.id) {
            window.AppRouter.go('match', matchData.fixture.id);
        }
    }

    async function checkLiveMatches() {
        try {
            if (Utils && !Utils.isRefreshNeeeded()) return;

            const liveData = await API.fetch('fixtures?live=all');
            if (liveData === null || !Array.isArray(liveData)) return;

            const allowedLeagues = State.globalSettings.allowed_leagues || [];
            const allowedIds = new Set(allowedLeagues.map(l => Number(l.id)));
            const favTeams = new Set((State.appConfig.favorite_teams || []).map(t => Number(t.id)));
            const favLeagues = new Set((State.appConfig.favorite_leagues || []).map(l => Number(l.id)));

            for (const m of liveData) {
                const mid = m.fixture.id;
                const isTracked = Utils ? Utils.isTracked(mid) : false;
                const isFav = favTeams.has(Number(m.teams.home.id)) || favTeams.has(Number(m.teams.away.id)) || favLeagues.has(Number(m.league.id));
                const isAllowed = allowedIds.has(Number(m.league.id));
                const isCurrentMatch = (window.AppState.currentMatchId === mid);

                const oldState = window.AppState.matchStates[mid];
                const newScore = `${m.goals.home}-${m.goals.away}`;
                const newStatusShort = m.fixture.status.short;
                const cards = document.querySelectorAll(`#match-card-${mid}`);

                if (!isTracked && !isFav && !isAllowed && !isCurrentMatch && !cards.length) continue;

                window.AppState.renderedMatches = window.AppState.renderedMatches?.map(mc => (mc.fixture.id === mid ? m : mc)) || null;
                window.AppState.matchesCache = window.AppState.matchesCache?.map(mc => (mc.fixture.id === mid ? m : mc)) || null;

                if (cards.length) {
                    for (const card of cards) {
                        const statusEl = card.querySelector('.match-status');
                        const scoreEls = card.querySelectorAll('.card-score');
                        if (scoreEls.length === 2) {
                            const h = m.goals.home ?? 0;
                            const a = m.goals.away ?? 0;
                            if (scoreEls[0].textContent != h) scoreEls[0].textContent = h;
                            if (scoreEls[1].textContent != a) scoreEls[1].textContent = a;
                        }
                        if (statusEl) {
                            let statusText = m.fixture.status.long;
                            if (['1H', 'HT', '2H', 'ET', 'P', 'BT'].includes(newStatusShort)) {
                                const timeText = newStatusShort === 'HT' ? 'Half Time' : (m.fixture.status.elapsed ? Utils.formTimeString(m.fixture.status) : 'LIVE');
                                statusEl.classList.add('live-time');
                                card.classList.add('is-live');
                                if (statusEl.textContent !== timeText) statusEl.textContent = timeText;
                            } else {
                                statusEl.classList.remove('live-time');
                                card.classList.remove('is-live');
                                if (statusEl.textContent !== statusText) statusEl.textContent = statusText;
                            }
                        }
                    }
                }

                if (isCurrentMatch) {
                    const scoreEl = document.querySelector('.details-score-box .details-score');
                    const statusEl = document.querySelector('.details-score-box .details-status');
                    if (scoreEl) {
                        const h = m.goals.home ?? 0;
                        const a = m.goals.away ?? 0;
                        const newScoreText = `${h} - ${a}`;
                        if (scoreEl.textContent != newScoreText) scoreEl.textContent = newScoreText;
                    }
                    if (statusEl) {
                        let statusText = m.fixture.status.long;
                        if (['1H', 'HT', '2H', 'ET', 'P', 'BT'].includes(newStatusShort)) {
                            const time = newStatusShort === 'HT' ? 'HT' : (m.fixture.status.elapsed ? `<span class="live-time">${Utils.formTimeString(m.fixture.status)}</span>` : 'LIVE');
                            if (statusEl.innerHTML !== time) statusEl.innerHTML = time;
                        } else if (statusEl.textContent !== statusText) {
                            statusEl.textContent = statusText;
                        }
                    }
                }

                if (!oldState) {
                    window.AppState.matchStates[mid] = { score: newScore, status: newStatusShort };
                    continue;
                }

                if (oldState.score !== newScore) {
                    let desc = "Goal scored!";
                    try {
                        const events = await API.fetch(`fixtures/events?fixture=${mid}`);
                        if (events && events.length) {
                            const goals = events.filter(e => e.type === 'Goal');
                            if (goals.length > 0) {
                                const lastGoal = goals[goals.length - 1];
                                desc = `Goal by ${lastGoal.player.name}${lastGoal.assist.name ? ` (Assist: ${lastGoal.assist.name})` : ''}`;
                            }
                        }
                    } catch (e) {}
                    showAlert('GOAL!', desc, m, 'goal', !isTracked && !isFav);
                }

                if (newStatusShort !== oldState.status) {
                    if (['FT', 'AET', 'PEN'].includes(newStatusShort)) {
                        const desc = `Final Score: ${newScore}`;
                        showAlert('Full Time', desc, m, 'ft', !isTracked && !isFav);
                        if (isTracked) removeTrackedMatch(mid, cards);
                    }
                    const isActuallyLive = ['1H', 'HT', '2H', 'ET', 'P', 'BT'].includes(newStatusShort);
                    const detailsHero = document.querySelector(".details-hero");
                    if (detailsHero) {
                        detailsHero.classList.toggle("is-live", isActuallyLive);
                    }
                }
                window.AppState.matchStates[mid] = { score: newScore, status: newStatusShort };
            }
        } catch (e) {
            console.warn("Live monitor check skipped", e);
        }
    }

    function updateAllTeamFavVisuals(teamId, isActive) {
        const tid = Number(teamId);
        // Update inline star buttons on match cards
        document.querySelectorAll(`.team-inline-fav[data-team-id="${tid}"]`).forEach(btn => {
            btn.classList.toggle('active', isActive);
        });
        document.querySelectorAll(`.card-team[data-team-id="${tid}"]`).forEach(row => {
            row.classList.toggle('favorite', isActive);
        });
        // Update Match Details team hero buttons
        document.querySelectorAll(`.details-team[data-team-id="${tid}"]`).forEach(teamBtn => {
            teamBtn.classList.toggle('is-fav', isActive);
            const pill = teamBtn.querySelector('.details-team-fav-pill');
            if (pill) {
                pill.classList.toggle('active', isActive);
                pill.textContent = isActive ? '★ Favorite Team' : '☆ Click / OK to Fav';
            }
        });
        // Update Standings table rows
        document.querySelectorAll(`.standings-team-row[data-team-id="${tid}"]`).forEach(tr => {
            tr.classList.toggle('favorite', isActive);
            const star = tr.querySelector('.team-fav-star');
            if (star) star.classList.toggle('active', isActive);
        });
    }

    function setupDelegatedEvents(container) {
        container.addEventListener('click', async (e) => {
            const target = e.target;

            // 1. Clickable Team Favorite anywhere (Match Cards, Match Details Hero, Standings rows, Quick-Tap Chips)
            const favTeamTrigger = target.closest('[data-action="toggle-fav-team"]');
            if (favTeamTrigger) {
                e.preventDefault();
                e.stopPropagation();
                const id = Number(favTeamTrigger.dataset.teamId);
                const name = favTeamTrigger.dataset.teamName || 'Team';
                const logo = favTeamTrigger.dataset.teamLogo || `https://media.api-sports.io/football/teams/${id}.png`;
                if (!id) return;

                const res = await FavoritesService.toggle('team', { id, name, logo });
                const isActive = Boolean(res && res.active);
                updateAllTeamFavVisuals(id, isActive);
                Helpers.showToast(
                    isActive ? `★ Added ${name} to Favorites & Widget` : `Removed ${name} from Favorites`,
                    isActive ? 'success' : 'info'
                );

                // If on Favorites page, re-render to show updated grid while preserving focus
                if (window.AppRouter.current && window.AppRouter.current.name === 'account') {
                    const focusedId = favTeamTrigger.dataset.teamId;
                    await window.AppViews.renderAccountPage(container);
                    const restored = container.querySelector(`.quick-club-chip[data-team-id="${focusedId}"]`);
                    if (restored && window.Navigation) window.Navigation.focus(restored, false);
                } else if (window.AppRouter.current && window.AppRouter.current.name === 'home') {
                    const parentCard = favTeamTrigger.closest('.match-card');
                    const cardId = parentCard ? parentCard.id : null;
                    await window.AppViews.renderHome(container);
                    if (cardId) {
                        const restoredCard = document.getElementById(cardId);
                        if (restoredCard && window.Navigation) window.Navigation.focus(restoredCard, false);
                    }
                }
                return;
            }

            // 2. Clickable Quick-Tap League Chip
            const favLeagueChip = target.closest('[data-action="toggle-fav-league"]');
            if (favLeagueChip) {
                e.preventDefault();
                e.stopPropagation();
                const id = Number(favLeagueChip.dataset.leagueId);
                const name = favLeagueChip.dataset.leagueName || 'League';
                const logo = favLeagueChip.dataset.leagueLogo || `https://media.api-sports.io/football/leagues/${id}.png`;
                if (!id) return;

                const res = await FavoritesService.toggle('league', { id, name, logo });
                const isActive = Boolean(res && res.active);
                Helpers.showToast(
                    isActive ? `★ Added ${name} to Favorite Leagues` : `Removed ${name} from Favorite Leagues`,
                    isActive ? 'success' : 'info'
                );
                if (window.AppRouter.current && window.AppRouter.current.name === 'account') {
                    await window.AppViews.renderAccountPage(container);
                    const restored = container.querySelector(`.quick-club-chip[data-league-id="${id}"]`);
                    if (restored && window.Navigation) window.Navigation.focus(restored, false);
                }
                return;
            }

            // 3. Sort headers in Player Stats
            const sortHeader = target.closest('.sort-header');
            if (sortHeader) {
                const table = sortHeader.closest('table');
                const type = table.dataset.type;
                const sortKey = sortHeader.dataset.sort;
                let data = type === 'goals' ? [...window.AppState.currentLeagueStats.scorers] : [...window.AppState.currentLeagueStats.assists];
                data.sort((a, b) => {
                    const sA = a.statistics[0];
                    const sB = b.statistics[0];
                    let valA, valB;
                    switch (sortKey) {
                        case 'pos': valA = sA.games.position; valB = sB.games.position; break;
                        case 'app': valA = sA.games.appearences || 0; valB = sB.games.appearences || 0; break;
                        case 'rating': valA = parseFloat(sA.games.rating || 0); valB = parseFloat(sB.games.rating || 0); break;
                        case 'shots': valA = sA.shots.total || 0; valB = sB.shots.total || 0; break;
                        case 'main': valA = type === 'goals' ? (sA.goals.total || 0) : (sA.goals.assists || 0); valB = type === 'goals' ? (sB.goals.total || 0) : (sB.goals.assists || 0); break;
                    }
                    return valA < valB ? 1 : (valA > valB ? -1 : 0);
                });
                const tabId = type === 'goals' ? 'l-scr' : 'l-ast';
                const tabContent = document.getElementById(tabId);
                if (tabContent && Components) {
                    tabContent.innerHTML = Components.renderPlayerStats(data, type);
                    if (window.Navigation) window.Navigation.scan();
                }
                return;
            }

            // 4. League header or Match Hero league button
            const leagueTrigger = target.closest('[data-action="open-league"]');
            if (leagueTrigger) {
                e.preventDefault();
                e.stopPropagation();
                const id = leagueTrigger.dataset.id;
                const season = leagueTrigger.dataset.season || Helpers.getCurrentSeason();
                if (id) window.AppRouter.go('league', { id, season });
                return;
            }

            // 5. League Favorite heart toggle
            const favBtn = target.closest('.fav-toggle');
            if (favBtn) {
                e.preventDefault();
                e.stopPropagation();
                const type = favBtn.dataset.type || 'league';
                const id = Number(favBtn.dataset.id);
                const name = favBtn.dataset.name || 'Unknown';
                const logo = favBtn.dataset.logo || '';
                const res = await FavoritesService.toggle(type, { id, name, logo });
                const active = Boolean(res && res.active);
                favBtn.classList.toggle('active', active);
                Helpers.showToast(active ? `Added ${name} to Favorites` : `Removed ${name} from Favorites`, active ? 'success' : 'info');
                return;
            }

            // 6. Tab buttons & Track Match button
            const tabBtn = target.closest('.tab-button');
            if (tabBtn) {
                if (tabBtn.id === 'btn-track-toggle') {
                    const mid = Number(tabBtn.dataset.id || tabBtn.dataset.mid || window.AppState.currentMatchId);
                    if (mid && Utils && typeof Utils.toggleTrackVisual === 'function') {
                        Utils.toggleTrackVisual(mid, tabBtn);
                    }
                } else {
                    const parent = tabBtn.closest('.page-container');
                    if (parent) {
                        parent.querySelectorAll('.tab-button:not(#btn-track-toggle):not(.fav-toggle)').forEach(b => b.classList.remove('active'));
                        parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                        tabBtn.classList.add('active');
                        const contentId = tabBtn.dataset.tab;
                        const content = parent.querySelector('#' + contentId);
                        if (content) content.classList.add('active');
                        window.AppState.currentTab = contentId || null;
                    }
                }
                return;
            }

            // 7. Open Match Card
            const card = target.closest('.match-card, .bracket-match, .kb-match');
            if (card) {
                e.preventDefault();
                e.stopPropagation();
                const action = card.dataset.action;
                const id = card.dataset.id;
                if (action === 'open-match' && id) window.AppRouter.go('match', id);
                return;
            }

            // 8. Remove Favorite button on Account page
            const removeBtn = target.closest('.fav-remove-btn');
            if (removeBtn) {
                e.preventDefault();
                e.stopPropagation();
                const type = removeBtn.dataset.type;
                const id = Number(removeBtn.dataset.id);
                await FavoritesService.remove(type, id);
                Helpers.showToast('Removed from favorites', 'info');
                if (window.AppRouter.current && window.AppRouter.current.name === 'account') {
                    window.AppViews.renderAccountPage(document.getElementById('content-container'));
                }
                return;
            }

            // 8b. Player scope button on Account page
            const playerScopeBtn = target.closest('.fav-player-btn');
            if (playerScopeBtn) {
                e.preventDefault();
                e.stopPropagation();
                const teamId = playerScopeBtn.dataset.teamId || null;
                const leagueId = playerScopeBtn.dataset.leagueId || null;
                const scopeName = playerScopeBtn.dataset.teamName || playerScopeBtn.dataset.leagueName || '';
                window.AppRouter.go('fav-add', { type: 'player', teamId, leagueId, scopeName });
                return;
            }

            // 9. Search Favorite button
            const addBtn = target.closest('.add-fav-btn');
            if (addBtn) {
                e.preventDefault();
                e.stopPropagation();
                const type = addBtn.dataset.type || 'team';
                window.AppRouter.go('fav-add', { type });
                return;
            }

            // 10. Search result card click
            const addCard = target.closest('.fav-add-card');
            if (addCard) {
                e.preventDefault();
                e.stopPropagation();
                const type = addCard.dataset.type || 'team';
                const id = Number(addCard.dataset.id);
                const name = addCard.dataset.name || 'Unknown';
                const logo = addCard.dataset.logo || '';
                const extra = addCard.dataset.extra || '';

                const obj = { id, name, logo };
                if (extra) obj.country = extra;
                const res = await FavoritesService.toggle(type, obj);
                Helpers.showToast(
                    res.active ? `Added ${name} to Favorites` : `Removed ${name} from Favorites`,
                    res.active ? 'success' : 'info'
                );
                window.AppRouter.go('account');
                return;
            }
        });
    }

    function initMyPCApp() {
        if (window.Navigation) window.Navigation.init();

        const container = document.getElementById('content-container');
        if (container) setupDelegatedEvents(container);

        document.addEventListener('nav-back', () => { window.AppRouter.back(); });

        // Automatic background sync on page hide / visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && Storage && Storage.syncToWidgetServiceBridge) {
                Storage.syncToWidgetServiceBridge(State.appConfig);
            }
        });

        const showModal = (id) => {
            const overlay = document.getElementById('modal-overlay');
            const target = document.getElementById(id);
            if (!overlay || !target) return;
            document.querySelectorAll('.modal-content').forEach(d => { d.style.display = 'none'; });
            overlay.classList.add('visible');
            target.style.display = 'block';
            if (window.Navigation) window.Navigation.setScope(target);
        };

        const closeModal = () => {
            const overlay = document.getElementById('modal-overlay');
            if (overlay) overlay.classList.remove('visible');
            if (window.Navigation) {
                window.Navigation.setScope(null);
                const activeNav = document.querySelector('#sidebar .active');
                if (activeNav) window.Navigation.focus(activeNav);
            }
        };

        window.AppUI = { showModal, closeModal, updateAllTeamFavVisuals };

        const navCalendar = document.getElementById('nav-calendar');
        if (navCalendar) navCalendar.onclick = (e) => { e.preventDefault(); showModal('date-modal'); };

        const navAuth = document.getElementById('nav-auth');
        if (navAuth) navAuth.onclick = (e) => {
            e.preventDefault();
            window.AppRouter.go('account');
        };

        const navSettings = document.getElementById('nav-settings');
        if (navSettings) navSettings.onclick = (e) => {
            e.preventDefault();
            window.AppRouter.go('settings');
        };

        const navHome = document.getElementById('nav-home');
        if (navHome) navHome.onclick = (e) => {
            e.preventDefault();
            if (window.AppRouter.current && window.AppRouter.current.name === 'home') {
                const content = document.querySelector('#content-container .focusable');
                if (content && window.Navigation) window.Navigation.focus(content);
            } else {
                window.AppRouter.go('home');
            }
        };

        const refreshDateView = () => {
            const modalDate = document.getElementById('modal-current-date');
            if (modalDate) modalDate.textContent = Helpers.formatDisplayDate(window.AppState.currentDate);
            const dateHeader = document.getElementById('date-header');
            if (dateHeader) dateHeader.textContent = Helpers.formatDisplayDate(window.AppState.currentDate);
            window.AppState.matchesCache = null;
            window.AppRouter.go('home');
        };

        const btnPrevDay = document.getElementById('btn-prev-day');
        if (btnPrevDay) btnPrevDay.onclick = () => {
            window.AppState.isLiveMode = false;
            window.AppState.currentDate.setDate(window.AppState.currentDate.getDate() - 1);
            refreshDateView();
        };

        const btnNextDay = document.getElementById('btn-next-day');
        if (btnNextDay) btnNextDay.onclick = () => {
            window.AppState.isLiveMode = false;
            window.AppState.currentDate.setDate(window.AppState.currentDate.getDate() + 1);
            refreshDateView();
        };

        const btnLiveToggle = document.getElementById('btn-live-toggle');
        if (btnLiveToggle) btnLiveToggle.onclick = () => {
            window.AppState.isLiveMode = !window.AppState.isLiveMode;
            closeModal();
            refreshDateView();
        };

        document.querySelectorAll('.modal-close').forEach(b => { b.onclick = closeModal; });

        window.AppRouter.enableWebHistory();

        // Check if launched via deep link from Widget or Push Notification
        if (typeof MyPC !== 'undefined' && MyPC.launch && MyPC.launch.path) {
            window.AppRouter.routeDeepLink(MyPC.launch.path);
            if (!window.AppRouter.current) window.AppRouter.render();
        } else if (window.location.hash && window.location.hash !== '#' && window.location.hash !== '#/home') {
            window.AppRouter.current = window.AppRouter.parseHashRoute();
            window.AppRouter.render();
        } else {
            window.AppRouter.render();
        }

        if (Utils && Utils.updateClock) {
            Utils.updateClock();
            setInterval(() => { Utils.updateClock(); }, 60000);
        }
    }

    if (typeof MyPC !== 'undefined') {
        MyPC.init({
            onInit: async function(info) {
                const username = (info && info.profile && info.profile.name) ? info.profile.name : "Player";
                State.currentUser.name = username;

                await Storage.loadUserConfig(username);

                initMyPCApp();

                // another device (TV / PC / phone) changed favorites or tracked matches: show it
                Storage.onChange(() => {
                    window.AppState.matchesCache = null;
                    if (window.AppRouter && typeof window.AppRouter.render === 'function') window.AppRouter.render();
                });
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden) Storage.refreshFromBridge();
                });

                MyPC.setMenu([
                    { id: 'today', label: 'Today Matches' },
                    { id: 'live-only', label: 'Live Matches Only' },
                    { id: 'favorites', label: 'My Favorite Teams' },
                    { id: 'settings', label: 'Controller & Widget Settings' }
                ]);

                MyPC.ready();
            },
            onStart: function() {
                startLiveTimers();
                checkLiveMatches();
                Storage.syncToWidgetServiceBridge(State.appConfig);
            },
            onPause: function() {
                stopLiveTimers();
                Storage.syncToWidgetServiceBridge(State.appConfig);
            },
            onResume: function() {
                Storage.refreshFromBridge();
                startLiveTimers();
                checkLiveMatches();
            },
            onDestroy: function() {
                stopLiveTimers();
                Storage.syncToWidgetServiceBridge(State.appConfig);
            },
            onLaunch: function(launch) {
                if (launch && launch.path && window.AppRouter) {
                    window.AppRouter.routeDeepLink(launch.path);
                }
            },
            onInput: function(action, pressed, repeat, dev) {
                if (window.Navigation && typeof window.Navigation.handleAction === 'function') {
                    window.Navigation.handleAction(action, pressed, repeat, dev);
                }
            },
            onMenu: function(id) {
                if (id === 'today') {
                    window.AppState.isLiveMode = false;
                    window.AppState.currentDate = new Date();
                    window.AppState.matchesCache = null;
                    window.AppRouter.go('home');
                } else if (id === 'live-only') {
                    window.AppState.isLiveMode = true;
                    window.AppState.matchesCache = null;
                    window.AppRouter.go('home');
                } else if (id === 'favorites') {
                    window.AppRouter.go('account');
                } else if (id === 'settings') {
                    window.AppRouter.go('settings');
                }
            }
        });

        if (MyPC.gamepad && typeof MyPC.gamepad.on === 'function') {
            MyPC.gamepad.on('button', function(index, pressed, value, dev, name) {
                if (!pressed) return;
                if (window.ButtonMapper && typeof window.ButtonMapper.isListening === 'function' && window.ButtonMapper.isListening()) {
                    window.ButtonMapper.recordInput(name || ('Button' + index), dev);
                    return;
                }
                if (window.Navigation && typeof window.Navigation.handleAction === 'function') {
                    window.Navigation.handleAction(name, pressed, false, dev);
                }
            });
        }
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            initMyPCApp();
            startLiveTimers();
            checkLiveMatches();
        });
    }
})();
