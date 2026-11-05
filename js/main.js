"use strict";

(function() {
    if (!window.AppServices) { console.error("AppServices not loaded!"); return; }

    const { State, API, Storage, Helpers, FavoritesService } = window.AppServices;
    const Components = window.AppComponents;
    const Utils = window.Utils;

    // --- GLOBAL APP STATE INITIALIZATION ---
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

    // Load tracked matches
    try {
        const saved = localStorage.getItem('tracked_matches');
        if (saved) window.AppState.monitoredMatches = new Set(JSON.parse(saved));
    } catch(e) {}

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
            <div class="alert-header"><span class="alert-event-type">${title}</span><span class="alert-time">${Utils ? Utils.formTimeString(matchData.fixture.status) : ''}'</span></div>
            <div class="alert-teams">
                <div class="alert-team"><img src="${matchData.teams.home.logo}"><span>${matchData.teams.home.name}</span></div>
                <div class="alert-score-board">${homeScore} - ${awayScore}</div>
                <div class="alert-team"><img src="${matchData.teams.away.logo}"><span>${matchData.teams.away.name}</span></div>
            </div>
            <div class="alert-desc">${desc}</div>
        `;
        
        alertEl.style.display = 'flex';
        void alertEl.offsetWidth; 
        alertEl.classList.add('visible');
        if (!isSilent && window.Navigation) window.Navigation.focus(alertEl, false);

        const closeAlert = () => {
            alertEl.classList.remove('visible');
            setTimeout(() => alertEl.style.display = 'none', 300);
        };
        alertEl.onclick = () => { window.AppRouter.go('match', matchData.fixture.id); closeAlert(); };
        setTimeout(closeAlert, 10000);
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
            const allowedIds = new Set(allowedLeagues.map(l => l.id));
            const favTeams = new Set((State.appConfig.favorite_teams || []).map(t => t.id));
            const favLeagues = new Set((State.appConfig.favorite_leagues || []).map(l => l.id));

            for (const m of liveData) {
                const mid = m.fixture.id;
                const isTracked = Utils ? Utils.isTracked(mid) : false;
                const isFav = favTeams.has(m.teams.home.id) || favTeams.has(m.teams.away.id) || favLeagues.has(m.league.id);
                const isAllowed = allowedIds.has(m.league.id);
                const isCurrentMatch = (window.AppState.currentMatchId === mid);

                const oldState = window.AppState.matchStates[mid];
                const newScore = `${m.goals.home}-${m.goals.away}`;
                const newStatusShort = m.fixture.status.short;
                const cards = document.querySelectorAll(`#match-card-${mid}`);
                
                if (!isTracked && !isFav && !isAllowed && !isCurrentMatch && !cards.length) continue;

                window.AppState.renderedMatches = window.AppState.renderedMatches?.map(mc => {
                    if (mc.fixture.id === mid) return m;
                    return mc;
                }) || null;

                window.AppState.matchesCache = window.AppState.matchesCache?.map(mc => {
                    if (mc.fixture.id === mid) return m;
                    return mc;
                }) || null;

                if (cards.length) {
                    for (const card of cards) {
                        const statusEl = card.querySelector('.match-status');
                        const scoreEls = card.querySelectorAll('.card-score');
                        if (scoreEls.length === 2) {
                            const h = m.goals.home ?? 0; const a = m.goals.away ?? 0;
                            if (scoreEls[0].textContent != h) scoreEls[0].textContent = h;
                            if (scoreEls[1].textContent != a) scoreEls[1].textContent = a;
                        }
                        if (statusEl) {
                            let statusText = m.fixture.status.long;
                            if (['1H','HT','2H','ET','P','BT'].includes(newStatusShort)) {
                                const time = newStatusShort === 'HT' ? 'HT' : (m.fixture.status.elapsed ? `<span class="live-time">${Utils.formTimeString(m.fixture.status)}</span>` : 'LIVE');
                                if (statusEl.innerHTML !== time) statusEl.innerHTML = time;
                            } else if (statusEl.textContent !== statusText) statusEl.textContent = statusText;
                        }
                    }
                }

                if (isCurrentMatch) {
                    const scoreEl = document.querySelector('.details-score-box .details-score');
                    const statusEl = document.querySelector('.details-score-box .details-status');
                    if (scoreEl) {
                        const h = m.goals.home ?? 0; const a = m.goals.away ?? 0;
                        const newScoreText = `${h} - ${a}`;
                        if (scoreEl.textContent != newScoreText) scoreEl.textContent = newScoreText;
                    }
                    if (statusEl) {
                        let statusText = m.fixture.status.long;
                        if (['1H','HT','2H','ET','P','BT'].includes(newStatusShort)) {
                            const time = newStatusShort === 'HT' ? 'HT' : (m.fixture.status.elapsed ? `<span class="live-time">${Utils.formTimeString(m.fixture.status)}</span>` : 'LIVE');
                            if (statusEl.innerHTML !== time) statusEl.innerHTML = time;
                        } else if (statusEl.textContent !== statusText) statusEl.textContent = statusText;
                    }
                }

                if (!oldState) { window.AppState.matchStates[mid] = { score: newScore, status: newStatusShort }; continue; }

                if (oldState.score !== newScore) {
                    let desc = "Goal scored!";
                    try {
                        const events = await API.fetch(`fixtures/events?fixture=${mid}`);
                        if (events && events.length) {
                            const goals = events.filter(e => e.type === 'Goal');
                            if (goals.length > 0) {
                                const lastGoal = goals[goals.length-1];
                                desc = `Goal by ${lastGoal.player.name}${lastGoal.assist.name ? ` (Assist: ${lastGoal.assist.name})` : ''}`;
                            }
                        }
                    } catch(e) {}
                    showAlert('GOAL!', desc, m, 'goal', !isTracked);
                }
                
                if (newStatusShort !== oldState.status) {
                    if (['FT', 'AET', 'PEN'].includes(newStatusShort)) {
                        const desc = `Finished: ${newScore}`;
                        showAlert('Full Time', desc, m, 'ft', !isTracked);
                        if (isTracked) removeTrackedMatch(mid, cards);
                    }
                    const isActuallyLive = ['1H','HT','2H','ET','P','BT'].includes(newStatusShort);
                    const detailsHero = document.querySelector(".details-hero");
                    if (detailsHero) {
                        if (isActuallyLive) detailsHero.classList.add("is-live");
                        else detailsHero.classList.remove("is-live");
                    }
                }
                window.AppState.matchStates[mid] = { score: newScore, status: newStatusShort };
            }
        } catch(e) { console.warn("Live monitor check skipped", e); }
    }

    function setupDelegatedEvents(container) {
        container.addEventListener('click', async (e) => {
            const target = e.target;

            const sortHeader = target.closest('.sort-header');
            if (sortHeader) {
                const table = sortHeader.closest('table');
                const type = table.dataset.type;
                const sortKey = sortHeader.dataset.sort;
                let data = type === 'goals' ? [...window.AppState.currentLeagueStats.scorers] : [...window.AppState.currentLeagueStats.assists];
                data.sort((a, b) => {
                    const sA = a.statistics[0]; const sB = b.statistics[0];
                    let valA, valB;
                    switch(sortKey) {
                        case 'pos': valA = sA.games.position; valB = sB.games.position; break;
                        case 'app': valA = sA.games.appearences || 0; valB = sB.games.appearences || 0; break;
                        case 'rating': valA = parseFloat(sA.games.rating || 0); valB = parseFloat(sB.games.rating || 0); break;
                        case 'shots': valA = sA.shots.total || 0; valB = sB.shots.total || 0; break;
                        case 'main': valA = type === 'goals' ? (sA.goals.total||0) : (sA.goals.assists||0); valB = type === 'goals' ? (sB.goals.total||0) : (sB.goals.assists||0); break;
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

            const tabBtn = target.closest('.tab-button');
            if (tabBtn) {
                if (tabBtn.id === 'btn-track-toggle') {
                     const mid = Number(tabBtn.dataset.mid);
                     if (Utils.isTracked(mid)) Utils.removeTracked(mid); else Utils.addTracked(mid);
                     if (Utils.isTracked(mid)) tabBtn.classList.add('track-active'); else tabBtn.classList.remove('track-active');
                } else {
                    const parent = tabBtn.closest('.page-container');
                    if (parent) {
                        parent.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                        parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                        tabBtn.classList.add('active');
                        const contentId = tabBtn.dataset.tab;
                        const content = parent.querySelector('#' + contentId);
                        if (content) {
                            content.classList.add('active');
                            if (contentId === 'ln' && window.AppState.currentTab === 'ln') {
                                content.classList.add('full-screen-mode');
                                if (!content.querySelector('.fs-close-btn')) {
                                    const closeBtn = document.createElement('button');
                                    closeBtn.className = 'fs-close-btn focusable';
                                    closeBtn.innerText = 'Close Full Screen';
                                    closeBtn.tabIndex = 0;
                                    closeBtn.onclick = (ev) => {
                                        ev.stopPropagation(); 
                                        content.classList.remove('full-screen-mode');
                                        closeBtn.remove();
                                        if (window.Navigation) window.Navigation.focus(tabBtn);
                                    };
                                    content.prepend(closeBtn);
                                    setTimeout(() => { if (window.Navigation) window.Navigation.focus(closeBtn); }, 50);
                                }
                            } else {
                                parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('full-screen-mode'));
                                const existingBtn = parent.querySelector('.fs-close-btn');
                                if (existingBtn) existingBtn.remove();
                            }
                        }
                        window.AppState.currentTab = target.dataset.tab || null;
                    }
                }
                return;
            }
            
            const card = target.closest('.match-card, .bracket-match, .kb-match');
            if (card) {
                e.preventDefault();
                e.stopPropagation();
                const action = card.dataset.action; 
                const id = card.dataset.id;
                
                if (action === 'open-match' && id) window.AppRouter.go('match', id);
                return;
            }

            const leagueHeader = target.closest('.row-header-content');
            if (leagueHeader) {
                e.preventDefault();
                e.stopPropagation();
                const season = leagueHeader.dataset.season || null;
                const action = leagueHeader.dataset.action;
                const id = leagueHeader.dataset.id;
                if (action === 'open-league' && id) window.AppRouter.go('league', { id, season });
                return;
            }

            // Favorites management
            const removeBtn = target.closest('.fav-remove-btn');
            if (removeBtn) {
                e.preventDefault(); e.stopPropagation();
                const type = removeBtn.dataset.type;
                const id = Number(removeBtn.dataset.id);
                await FavoritesService.remove(type, id);
                Helpers.showToast('Removed from favorites', 'info');

                if (window.AppRouter.current && window.AppRouter.current.name === 'account') {
                    window.AppViews.renderAccountPage(document.getElementById('content-container'));
                }
                return;
            }

            const playerBtn = target.closest('.fav-player-btn');
            if (playerBtn) {
                e.preventDefault(); e.stopPropagation();
                const teamId = playerBtn.dataset.teamId ? Number(playerBtn.dataset.teamId) : null;
                const leagueId = playerBtn.dataset.leagueId ? Number(playerBtn.dataset.leagueId) : null;
                const scopeName = playerBtn.dataset.teamName || playerBtn.dataset.leagueName || '';
                if (!teamId && !leagueId) { Helpers.showToast('Select a team/league to add players', 'error'); return; }
                window.AppRouter.go('fav-add', { type: 'player', teamId, leagueId, scopeName });
                return;
            }

            const addBtn = target.closest('.add-fav-btn');
            if (addBtn) {
                e.preventDefault(); e.stopPropagation();
                const type = addBtn.dataset.type || 'team';
                window.AppRouter.go('fav-add', { type });
                return;
            }

            const addCard = target.closest('.fav-add-card');
            if (addCard) {
                e.preventDefault(); e.stopPropagation();
                const type = addCard.dataset.type || 'team';
                const id = Number(addCard.dataset.id);
                const name = addCard.dataset.name || 'Unknown';
                const logo = addCard.dataset.logo || '';
                const extra = addCard.dataset.extra || '';

                if (FavoritesService.isFavorite(type, id)) {
                    Helpers.showToast('Already in favorites', 'info');
                } else {
                    const obj = { id, name };
                    if (type === 'player') { obj.photo = logo; if (extra) obj.team = extra; }
                    else { obj.logo = logo; if (extra) obj.country = extra; }
                    await FavoritesService.add(type, obj);
                    Helpers.showToast('Added to favorites', 'success');
                }

                window.AppRouter.go('account');
                return;
            }

            const favBtn = target.closest('.fav-toggle');
            if (favBtn) {
                e.preventDefault(); e.stopPropagation();
                const type = favBtn.dataset.type;
                const id = Number(favBtn.dataset.id);
                const name = favBtn.dataset.name || 'Unknown';
                const res = await FavoritesService.toggle(type, { id, name });
                favBtn.classList.toggle('active', res && res.active);
                Helpers.showToast(res && res.active ? 'Added to favorites' : 'Removed from favorites', res && res.active ? 'success' : 'info');
                return;
            }
        });
    }

    function initMyPCApp() {
        if (window.Navigation) window.Navigation.init();
        
        const container = document.getElementById('content-container');
        if (container) setupDelegatedEvents(container);

        document.addEventListener('nav-back', () => { window.AppRouter.back(); });

        const showModal = (id) => {
            const overlay = document.getElementById('modal-overlay');
            const target = document.getElementById(id);
            if (!overlay || !target) return;
            document.querySelectorAll('.modal-content').forEach(d => d.style.display = 'none');
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

        window.AppUI = { showModal, closeModal };

        const navCalendar = document.getElementById('nav-calendar');
        if (navCalendar) navCalendar.onclick = (e) => { e.preventDefault(); showModal('date-modal'); };

        const navAuth = document.getElementById('nav-auth');
        if (navAuth) navAuth.onclick = (e) => { e.preventDefault(); window.AppRouter.go('account'); };

        const navSettings = document.getElementById('nav-settings');
        if (navSettings) navSettings.onclick = (e) => { e.preventDefault(); window.AppRouter.go('settings'); };

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

        const updateDate = () => {
            const modalDate = document.getElementById('modal-current-date');
            if (modalDate) modalDate.textContent = Helpers.formatDate(window.AppState.currentDate);
            const dateHeader = document.getElementById('date-header');
            if (dateHeader) dateHeader.textContent = Helpers.formatDate(window.AppState.currentDate);
            window.AppRouter.go('home');
        };

        const btnPrevDay = document.getElementById('btn-prev-day');
        if (btnPrevDay) btnPrevDay.onclick = () => {
            window.AppState.currentDate.setDate(window.AppState.currentDate.getDate() - 1);
            window.AppState.matchesCache = null;
            updateDate();
        };

        const btnNextDay = document.getElementById('btn-next-day');
        if (btnNextDay) btnNextDay.onclick = () => {
            window.AppState.currentDate.setDate(window.AppState.currentDate.getDate() + 1);
            window.AppState.matchesCache = null;
            updateDate();
        };

        const btnLiveToggle = document.getElementById('btn-live-toggle');
        if (btnLiveToggle) btnLiveToggle.onclick = () => {
            window.AppState.isLiveMode = !window.AppState.isLiveMode;
            window.AppState.matchesCache = null;
            updateDate();
        };

        document.querySelectorAll('.modal-close').forEach(b => b.onclick = closeModal);

        window.AppRouter.render();
        if (Utils && Utils.updateClock) {
            Utils.updateClock();
            setInterval(() => { Utils.updateClock(); }, 60000);
        }
    }

    // --- MyPC SDK Integration (Mandatory lifecycle) ---
    if (typeof MyPC !== 'undefined') {
        MyPC.init({
            onInit: async function(info) {
                console.log("MyPC: onInit called", info);
                
                // Profile awareness & seamless Firebase synchronization
                const username = (info && info.profile && info.profile.name) ? info.profile.name : "Player";
                State.currentUser.name = username;

                // Load persistent config for this profile (seamlessly syncing with Football App Firebase)
                await Storage.loadUserConfig(username);

                // Initialize UI
                initMyPCApp();

                // Setup custom My PC pause menu items
                MyPC.setMenu([
                    { id: 'today', label: 'Today Matches' },
                    { id: 'live-only', label: 'Live Matches Only' },
                    { id: 'favorites', label: 'My Teams & Leagues' },
                    { id: 'settings', label: 'Button Mappings & Settings' }
                ]);

                // Signal ready to My PC shell
                MyPC.ready();
            },
            onStart: function() {
                console.log("MyPC: onStart called");
                startLiveTimers();
                checkLiveMatches();
            },
            onPause: function() {
                console.log("MyPC: onPause called");
                stopLiveTimers();
            },
            onResume: function() {
                console.log("MyPC: onResume called");
                startLiveTimers();
                checkLiveMatches();
            },
            onDestroy: function() {
                console.log("MyPC: onDestroy called");
                stopLiveTimers();
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
    } else {
        // Fallback if SDK script failed or running in non-SDK preview
        document.addEventListener('DOMContentLoaded', () => {
            initMyPCApp();
            startLiveTimers();
            checkLiveMatches();
        });
    }
})();
