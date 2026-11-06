"use strict";

window.AppComponents = (function() {
    const Utils = window.Utils;
    const { State, Helpers } = window.AppServices;
    const STAT_GROUPS = {
        "General": ["Ball Possession", "Fouls", "Corner Kicks", "Offsides"],
        "Expected Performance": ["expected_goals", "goals_prevented"],
        "Shooting": ["Total Shots", "Shots on Goal", "Shots off Goal", "Blocked Shots", "Shots insidebox", "Shots outsidebox"],
        "Discipline": ["Yellow Cards", "Red Cards"],
        "Defense": ["Goalkeeper Saves"],
        "Passing": ["Total passes", "Passes accurate", "Passes %"],
        "Advanced Analytics": ["Total", "H2H", "Attacking", "Defending", "Form", "Poisson Dist."]
    };

    function card(m, showBadge = false) {
        const statusShort = m.fixture?.status?.short || 'NS';
        const isActuallyLive = ['1H', 'HT', '2H', 'ET', 'P', 'BT'].includes(statusShort);
        const isFinished = ['FT', 'AET', 'PEN'].includes(statusShort);
        let statusText = m.fixture?.status?.long || statusShort;
        m.league.season = m.league.season || (new Date(m.fixture.date)).getFullYear();

        const matchDate = new Date(m.fixture.date);
        const isToday = matchDate.toDateString() === new Date().toDateString();
        const timeStr = matchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const dateTimeStr = Utils.fullDate(m.fixture.date);

        const homeIsFav = Helpers.isFav('team', m.teams.home.id);
        const awayIsFav = Helpers.isFav('team', m.teams.away.id);
        const homeFavCls = homeIsFav ? "favorite" : "";
        const awayFavCls = awayIsFav ? "favorite" : "";

        let match_status_cls = "";
        if (isActuallyLive) {
            if (statusShort === 'HT') {
                statusText = 'HT';
            } else if (m.fixture.status.elapsed) {
                statusText = Utils.formTimeString(m.fixture.status);
            } else {
                statusText = 'LIVE';
            }
            match_status_cls = "live-time";
        } else if (statusShort === 'NS') {
            statusText = isToday ? timeStr : dateTimeStr;
        } else if (isFinished) {
            statusText = statusShort;
        } else if (['PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(statusShort)) {
            match_status_cls = "status-cancelled";
            statusText = statusShort;
        }

        const homeScore = statusShort === 'NS' ? '-' : (m.goals.home ?? 0);
        const awayScore = statusShort === 'NS' ? '-' : (m.goals.away ?? 0);
        const badgeHtml = showBadge
            ? `<div class="card-league-badge">${Utils.ImageLoader.tag(m.league.logo, m.league.name, 'league-logo')}<span>${m.league.name}</span></div>`
            : '';

        const isTracked = Utils.isTracked(m.fixture.id);
        const trackIndicator = isTracked ? `<div class="track-indicator" title="Tracked for live alerts"></div>` : '';
        const soonIndicator = Utils.isSoon(m) && !isActuallyLive
            ? `<div class="starting-soon" title="Starting soon"><svg class="hourglass-pulse"><use href="#icon-hourglass"></use></svg></div>`
            : '';

        let penIndicator = '';
        if (m.score?.penalty?.home !== null && m.score?.penalty?.away !== null && m.score?.penalty?.home !== undefined) {
            penIndicator = `<div class="card-pen-note">Pen: ${m.score.penalty.home} - ${m.score.penalty.away}</div>`;
        }

        const safeHomeName = String(m.teams.home.name || 'Home').replace(/"/g, '&quot;');
        const safeAwayName = String(m.teams.away.name || 'Away').replace(/"/g, '&quot;');
        const safeHomeLogo = String(m.teams.home.logo || '').replace(/"/g, '&quot;');
        const safeAwayLogo = String(m.teams.away.logo || '').replace(/"/g, '&quot;');

        return `
        <div id="match-card-${m.fixture.id}"
             class="match-card focusable ${isActuallyLive ? 'is-live' : ''} ${isFinished ? 'is-finished' : ''}"
             tabindex="0"
             role="button"
             aria-label="${safeHomeName} ${homeScore} versus ${safeAwayName} ${awayScore}, ${statusText}"
             data-action="open-match"
             data-id="${m.fixture.id}"
             data-home-id="${m.teams.home.id}"
             data-home-name="${safeHomeName}"
             data-home-logo="${safeHomeLogo}"
             data-away-id="${m.teams.away.id}"
             data-away-name="${safeAwayName}"
             data-away-logo="${safeAwayLogo}"
             data-season="${m.league.season}">
            ${trackIndicator}
            ${soonIndicator}
            <div class="card-top-bar">
                ${badgeHtml || `<span class="card-round-label">${(m.league?.name || '').slice(0, 22)}</span>`}
                <div class="match-status ${match_status_cls}">${statusText}</div>
            </div>
            <div class="card-teams">
                <div class="card-team ${homeFavCls}" data-team-id="${m.teams.home.id}">
                    <div class="card-team-info">
                        ${Utils.ImageLoader.tag(m.teams.home.logo, m.teams.home.name, 'team-logo')}
                        <span class="card-team-name">${m.teams.home.name}</span>
                        <button type="button"
                                class="team-inline-fav ${homeIsFav ? 'active' : ''}"
                                data-action="toggle-fav-team"
                                data-team-id="${m.teams.home.id}"
                                data-team-name="${safeHomeName}"
                                data-team-logo="${safeHomeLogo}"
                                title="Favorite ${safeHomeName}"
                                aria-label="Favorite ${safeHomeName}"
                                tabindex="-1">★</button>
                    </div>
                    <span class="card-score">${homeScore}</span>
                </div>
                <div class="card-team ${awayFavCls}" data-team-id="${m.teams.away.id}">
                    <div class="card-team-info">
                        ${Utils.ImageLoader.tag(m.teams.away.logo, m.teams.away.name, 'team-logo')}
                        <span class="card-team-name">${m.teams.away.name}</span>
                        <button type="button"
                                class="team-inline-fav ${awayIsFav ? 'active' : ''}"
                                data-action="toggle-fav-team"
                                data-team-id="${m.teams.away.id}"
                                data-team-name="${safeAwayName}"
                                data-team-logo="${safeAwayLogo}"
                                title="Favorite ${safeAwayName}"
                                aria-label="Favorite ${safeAwayName}"
                                tabindex="-1">★</button>
                    </div>
                    <span class="card-score">${awayScore}</span>
                </div>
            </div>
            ${penIndicator}
        </div>`;
    }

    function renderKnockout(matches) {
        if (!matches || matches.length === 0) {
            return '<div class="scrollable-content focusable" tabindex="0">No Knockout Stage available.</div>';
        }

        const groups = {};
        matches.forEach(m => {
            const r = (m?.league?.round || 'Knockout').trim();
            if (!groups[r]) groups[r] = [];
            groups[r].push(m);
        });

        const roundOrder = [
            'Round of 32',
            'Round of 16',
            '8th Finals',
            'Quarter-finals',
            'Semi-finals',
            'Final',
            '3rd Place Final',
            'Match for 3rd place'
        ];

        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const idxA = roundOrder.findIndex(k => a.includes(k));
            const idxB = roundOrder.findIndex(k => b.includes(k));
            const va = idxA === -1 ? 999 : idxA;
            const vb = idxB === -1 ? 999 : idxB;
            if (va !== vb) return va - vb;
            return a.localeCompare(b);
        });

        sortedKeys.forEach(k => {
            groups[k].sort((x, y) => {
                const dx = new Date(x?.fixture?.date || 0).getTime();
                const dy = new Date(y?.fixture?.date || 0).getTime();
                return dx - dy;
            });
        });

        const MATCH_H = 132;
        const GAP = 34;
        const VSTEP = MATCH_H + GAP;
        const roundCount = sortedKeys.length;
        const positionsByRound = [];

        const getTeams = (m) => {
            const hRaw = m?.teams?.home?.id;
            const aRaw = m?.teams?.away?.id;
            const h = (hRaw === null || hRaw === undefined || hRaw === '') ? null : Number(hRaw);
            const a = (aRaw === null || aRaw === undefined || aRaw === '') ? null : Number(aRaw);
            return { h, a };
        };

        const hasKnownTeams = (m) => {
            const { h, a } = getTeams(m);
            return Boolean(h && a);
        };

        const matchHasTeam = (m, teamId) => {
            if (!teamId) return false;
            const { h, a } = getTeams(m);
            return h === teamId || a === teamId;
        };

        const reorderPrevByNext = (prevMatches, nextMatches) => {
            if (!prevMatches || !prevMatches.length) return prevMatches || [];
            if (!nextMatches || !nextMatches.length) return prevMatches;
            const anyKnown = nextMatches.some(hasKnownTeams);
            if (!anyKnown) return prevMatches;

            const used = new Set();
            const out = [];
            const pushMatch = (m) => {
                const id = m?.fixture?.id;
                if (!id || used.has(id)) return;
                used.add(id);
                out.push(m);
            };

            for (const nm of nextMatches) {
                const { h, a } = getTeams(nm);
                if (!h || !a) continue;
                const srcA = prevMatches.find(pm => matchHasTeam(pm, h));
                const srcB = prevMatches.find(pm => matchHasTeam(pm, a) && pm?.fixture?.id !== srcA?.fixture?.id);
                if (srcA) pushMatch(srcA);
                if (srcB) pushMatch(srcB);
            }
            for (const pm of prevMatches) pushMatch(pm);
            return out;
        };

        const findPrevMatchTop = (prevPositions, prevRoundMatches, teamId) => {
            if (!teamId) return null;
            for (const pm of prevRoundMatches) {
                const { h, a } = getTeams(pm);
                if (h === teamId || a === teamId) {
                    const top = prevPositions.get(pm.fixture?.id);
                    if (Number.isFinite(top)) return top;
                }
            }
            return null;
        };

        const resolveCollisions = (tops, minGap) => {
            tops.sort((x, y) => x.top - y.top);
            for (let i = 1; i < tops.length; i++) {
                const prev = tops[i - 1];
                const cur = tops[i];
                if (cur.top < prev.top + minGap) {
                    cur.top = prev.top + minGap;
                }
            }
            const minTop = tops.length ? tops[0].top : 0;
            if (minTop > 0) {
                for (const t of tops) t.top -= minTop;
            }
            return tops;
        };

        for (let r = roundCount - 1; r >= 1; r--) {
            const nextKey = sortedKeys[r];
            const prevKey = sortedKeys[r - 1];
            groups[prevKey] = reorderPrevByNext(groups[prevKey] || [], groups[nextKey] || []);
        }

        const r0Key = sortedKeys[0];
        const r0 = (groups[r0Key] || []).slice();
        const r0Pos = new Map();
        r0.forEach((m, i) => r0Pos.set(m?.fixture?.id, i * VSTEP));
        positionsByRound[0] = r0Pos;

        for (let r = 1; r < roundCount; r++) {
            const key = sortedKeys[r];
            const prevKey = sortedKeys[r - 1];
            const prevMatches = groups[prevKey] || [];
            const prevPos = positionsByRound[r - 1] || new Map();
            const list = (groups[key] || []).slice();

            const pos = new Map();
            const computed = [];

            list.forEach((m, idx) => {
                const { h, a } = getTeams(m);
                const hTop = findPrevMatchTop(prevPos, prevMatches, h);
                const aTop = findPrevMatchTop(prevPos, prevMatches, a);

                let top = null;
                if (Number.isFinite(hTop) && Number.isFinite(aTop) && hTop !== aTop) {
                    top = (hTop + aTop) / 2;
                } else if (Number.isFinite(hTop)) {
                    top = hTop;
                } else if (Number.isFinite(aTop)) {
                    top = aTop;
                } else {
                    top = idx * (VSTEP * 2);
                }

                computed.push({ id: m?.fixture?.id, top });
            });

            const fixed = resolveCollisions(computed, VSTEP);
            fixed.forEach(t => pos.set(t.id, t.top));
            list.sort((x, y) => (pos.get(x?.fixture?.id) ?? 0) - (pos.get(y?.fixture?.id) ?? 0));
            groups[key] = list;
            positionsByRound[r] = pos;
        }

        const safeTitle = (s) => (s || '').replace('Regular Season - ', '').trim();

        const teamRow = (team, score) => {
            const name = team?.name || '-';
            const logo = team?.logo || '';
            const logoTag = (Utils?.ImageLoader?.tag)
                ? Utils.ImageLoader.tag(logo, name, 'kb-team-logo')
                : `<img class="kb-team-logo" src="${logo}" alt="${name}">`;
            const winnerClass = team?.winner ? ' winner' : '';
            return `
                <div class="kb-team${winnerClass}">
                    <div class="kb-team-left">
                        ${logoTag}
                        <span class="kb-team-name">${name}</span>
                    </div>
                    <span class="kb-team-score">${score}</span>
                </div>`;
        };

        const matchBox = (m, topPx) => {
            const h = m?.goals?.home;
            const a = m?.goals?.away;
            const homeScore = (m?.fixture?.status?.short === 'NS' || h === null || h === undefined) ? '-' : (h ?? 0);
            const awayScore = (m?.fixture?.status?.short === 'NS' || a === null || a === undefined) ? '-' : (a ?? 0);
            const d = m?.fixture?.date ? new Date(m.fixture.date) : null;
            const timeStr = d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
            const dayStr = d ? `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString([], { month: 'short' })}` : '';
            const status = m?.fixture?.status?.short || '';
            const badge = status && ['1H', 'HT', '2H', 'ET', 'P', 'BT'].includes(status)
                ? `<span class="kb-live">LIVE</span>`
                : '';

            return `
                <div class="kb-match focusable" role="button" tabindex="0" data-action="open-match" data-id="${m?.fixture?.id}" style="top:${topPx}px;">
                    <div class="kb-meta">
                        <span class="kb-date">${dayStr}</span>
                        <span class="kb-time">${timeStr}</span>
                        ${badge}
                    </div>
                    ${teamRow(m?.teams?.home, homeScore)}
                    ${teamRow(m?.teams?.away, awayScore)}
                </div>`;
        };

        let html = `<div class="scrollable-content focusable knockout-scroll" tabindex="0"><div class="kb-wrapper stage-block" style="height:100%;">`;
        sortedKeys.forEach((roundName, r) => {
            const list = groups[roundName] || [];
            const pos = positionsByRound[r] || new Map();
            html += `<div class="kb-round" data-round-index="${r}">
                        <div class="kb-round-title">${safeTitle(roundName)}</div>
                        <div class="kb-round-canvas">`;
            list.forEach((m, i) => {
                const coef = (2 ** r) - 1;
                let top = pos.get(m?.fixture?.id) ?? (i * VSTEP);
                top += coef * (VSTEP / 2);
                html += matchBox(m, top);
            });
            html += `</div></div>`;
        });
        html += `</div></div>`;
        return html;
    }

    function _parseStageAndSub(roundStr) {
        const raw = (roundStr || '').trim();
        if (!raw) return { stage: 'Matches', sub: '' };
        const parts = raw.split(' - ').map(s => (s || '').trim()).filter(Boolean);
        const stage = parts[0] || 'Matches';
        const tail = parts.slice(1);
        if (!tail.length) return { stage, sub: '' };

        const lowerStage = stage.toLowerCase();
        if (lowerStage.includes('regular season') && tail.length === 1 && /^\d+$/.test(tail[0])) {
            return { stage, sub: `Matchday ${tail[0]}` };
        }
        if (lowerStage.includes('group stage')) {
            const group = tail.find(x => /^group\s+/i.test(x));
            const num = tail.find(x => /^\d+$/.test(x));
            if (group && num) return { stage, sub: `${group} · Match ${num}` };
            if (group) return { stage, sub: group };
        }
        return { stage, sub: tail.join(' - ') };
    }

    function renderMatchesByStage(fixtures, opts = {}) {
        const limit = Number.isFinite(opts.limit) ? opts.limit : 160;
        if (!fixtures || !fixtures.length) {
            return '<div class="scrollable-content focusable" tabindex="0">No matches available.</div>';
        }

        const sorted = fixtures.slice().sort((a, b) => (b.fixture?.timestamp || 0) - (a.fixture?.timestamp || 0));
        const total = sorted.length;
        const trimmed = sorted.slice(0, Math.max(10, limit));

        const stageMap = new Map();
        for (const m of trimmed) {
            const { stage, sub } = _parseStageAndSub(m?.league?.round);
            if (!stageMap.has(stage)) stageMap.set(stage, new Map());
            const subMap = stageMap.get(stage);
            const subKey = sub || '__nosub__';
            if (!subMap.has(subKey)) subMap.set(subKey, []);
            subMap.get(subKey).push(m);
        }

        const stageOrder = ['Final', '3rd place', 'Semi-finals', 'Quarter-finals', 'Round of 16', '8th Finals', 'Group Stage', 'Regular Season', 'Play-offs', 'Relegation'];
        const stages = Array.from(stageMap.keys());
        stages.sort((a, b) => {
            const ia = stageOrder.findIndex(x => a.toLowerCase() === x.toLowerCase());
            const ib = stageOrder.findIndex(x => b.toLowerCase() === x.toLowerCase());
            const va = ia === -1 ? 999 : ia;
            const vb = ib === -1 ? 999 : ib;
            if (va !== vb) return va - vb;
            return a.localeCompare(b);
        });

        let html = '<div class="scrollable-content focusable" tabindex="0" style="padding-bottom:2rem;">';
        if (total > trimmed.length) {
            html += `<div class="matches-limit-note">Showing latest ${trimmed.length} of ${total} matches</div>`;
        }

        for (const stage of stages) {
            const subMap = stageMap.get(stage);
            html += `<div class="stage-block"><div class="stage-title">${stage}</div>`;
            const subKeys = Array.from(subMap.keys());
            subKeys.sort((a, b) => {
                if (a === '__nosub__') return -1;
                if (b === '__nosub__') return 1;
                return b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' });
            });

            for (const subKey of subKeys) {
                const list = subMap.get(subKey) || [];
                list.sort((a, b) => (b.fixture?.timestamp || 0) - (a.fixture?.timestamp || 0));
                if (subKey !== '__nosub__') {
                    html += `<div class="stage-subtitle">${subKey}</div>`;
                }
                html += `<div class="matches-container stage-matches">${list.map(m => card(m)).join('')}</div>`;
            }
            html += `</div>`;
        }

        html += '</div>';
        return html;
    }

    function renderStatBar(label, homeValRaw, awayValRaw, isPercent = false) {
        const cleanVal = (v) => {
            if (typeof v === 'string') return parseFloat(v.replace('%', '')) || 0;
            return parseFloat(v) || 0;
        };
        const hNum = cleanVal(homeValRaw);
        const aNum = cleanVal(awayValRaw);
        const total = hNum + aNum;

        let hPct, aPct;
        if (isPercent) {
            hPct = hNum;
            aPct = aNum;
        } else {
            if (total === 0) { hPct = 50; aPct = 50; }
            else {
                hPct = (hNum / total) * 100;
                aPct = (aNum / total) * 100;
            }
        }

        return `
        <div class="stat-row">
            <div class="stat-val home">${homeValRaw}</div>
            <div class="stat-bar-wrapper">
                <div class="stat-bar-home" style="width:${hPct}%"></div>
                <div class="stat-bar-away" style="width:${aPct}%"></div>
                <div class="stat-label-overlay">${label}</div>
            </div>
            <div class="stat-val away">${awayValRaw}</div>
        </div>`;
    }

    function renderPredictions(data) {
        if (!data) return '<div class="scrollable-content focusable" tabindex="0">No predictions available.</div>';
        const { predictions, comparison } = data;
        let advice = predictions?.advice || 'No advice available.';
        advice = advice.replace(/Combo Double chance : /i, '');

        const winner = predictions?.winner ? `${predictions.winner.name || ''} ${predictions.winner.comment ? `(${predictions.winner.comment})` : ''}` : '-';
        const winOrDraw = predictions?.win_or_draw ? 'Yes' : 'No';
        const underOver = predictions?.under_over || '-';

        let html = `<div class="scrollable-content focusable" tabindex="0" style="padding: 1.5rem 2rem 3rem;">`;
        html += `
            <div class="pred-summary-banner">
                <div class="pred-advice-title">${advice}</div>
                <div class="pred-metrics-row">
                    <div class="pred-stat-box"><span class="pred-stat-label">Favored Team</span><span class="pred-stat-val">${winner || '-'}</span></div>
                    <div class="pred-stat-box"><span class="pred-stat-label">Win or Draw</span><span class="pred-stat-val">${winOrDraw}</span></div>
                    <div class="pred-stat-box"><span class="pred-stat-label">Goals Line</span><span class="pred-stat-val">${underOver}</span></div>
                </div>
            </div>`;

        if (comparison) {
            html += `<div style="max-width:860px; margin:0 auto;">`;
            html += renderStatBar('Overall Strength', comparison.total.home, comparison.total.away, true);
            html += renderStatBar('Recent Form', comparison.form.home, comparison.form.away, true);
            html += renderStatBar('Attacking', comparison.att.home, comparison.att.away, true);
            html += renderStatBar('Defending', comparison.def.home, comparison.def.away, true);
            html += renderStatBar('Head-to-Head', comparison.h2h.home, comparison.h2h.away, true);
            html += renderStatBar('Goals Trend', comparison.goals.home, comparison.goals.away, true);
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    }

    function renderEvents(events, homeId) {
        if (!events || !events.length) return '<div class="scrollable-content focusable" tabindex="0" style="padding:2rem;text-align:center;">No match events recorded yet.</div>';
        const _events = events.slice().sort((a, b) => {
            const timeA = (a.time?.elapsed || 0) + (a.time?.extra ?? 0);
            const timeB = (b.time?.elapsed || 0) + (b.time?.extra ?? 0);
            return timeB - timeA;
        });
        const timelineHtml = _events.map(e => {
            const isHome = e.team?.id === homeId;
            const type = (e.type || '').toLowerCase();
            const detail = e.detail || '';

            let icon = '•';
            let importanceClass = 'normal';
            let divclass1 = 'event-player';
            let divclass2 = 'event-subtext';
            let assistText = 'Assist: ';

            if (type === 'goal') { icon = '⚽'; importanceClass = 'high'; }
            else if (type === 'card') { icon = detail.includes('Red') ? '🟥' : '🟨'; importanceClass = 'medium'; }
            else if (type === 'subst') { icon = '🔄'; importanceClass = 'low'; divclass1 = 'subst-out'; divclass2 = 'subst-in'; assistText = 'In: '; }
            else if (type === 'var') { icon = '📺'; importanceClass = 'low'; }

            const contentHtml = `
                <div class="event-box ${importanceClass}">
                    <div class="event-icon">${icon}</div>
                    <div class="event-info">
                        <div class="${divclass1}">${e.player?.name || ''}</div>
                        ${e.assist?.name ? `<div class="${divclass2}">${assistText}${e.assist.name}</div>` : ''}
                        ${detail && type !== 'goal' ? `<div class="event-subtext">${detail}</div>` : ''}
                    </div>
                </div>`;

            return `
            <div class="timeline-row">
                <div class="timeline-side home">${isHome ? contentHtml : ''}</div>
                <div class="timeline-center">
                    <div class="timeline-time">${e.time?.elapsed || 0}'${e.time?.extra ? `+${e.time.extra}` : ''}</div>
                    <div class="timeline-dot"></div>
                </div>
                <div class="timeline-side away">${!isHome ? contentHtml : ''}</div>
            </div>`;
        }).join('');

        return `<div class="scrollable-content focusable" tabindex="0"><div class="timeline-container"><div class="timeline-vertical-line"></div>${timelineHtml}</div></div>`;
    }

    function renderLineups(l, playerStats) {
        if (!l || l.length < 2) return '<div class="scrollable-content focusable" tabindex="0" style="padding:2rem;text-align:center;">Lineups not announced yet.</div>';
        let BestPlayer = null;
        const ratingsMap = {};
        if (playerStats && playerStats.length) {
            playerStats.forEach(teamGroup => {
                if (teamGroup.players) {
                    teamGroup.players.forEach(p => {
                        if (p.statistics && p.statistics[0] && p.statistics[0].games.rating) {
                            ratingsMap[p.player.id] = p.statistics[0].games.rating;
                            BestPlayer = !BestPlayer || parseFloat(p.statistics[0].games.rating) > parseFloat(ratingsMap[BestPlayer]) ? p.player.id : BestPlayer;
                        }
                    });
                }
            });
        }

        const getRating = (playerId) => ratingsMap[playerId] || null;
        const countGrid = (xi) => xi && xi.filter ? xi.filter(x => x.player && x.player.grid).length : 0;
        const usePitch = countGrid(l[0].startXI) > 7 && countGrid(l[1].startXI) > 7;
        const getClassBestPlayer = (pid) => pid === BestPlayer ? ' best-player' : '';
        const playersFav = (State.appConfig.favorite_players || []).map(t => t.id);

        const renderListRow = (p) => {
            if (!p) return '';
            const rating = getRating(p.id);
            const ratingClass = Utils.getRatingClass(rating);
            const rHtml = rating ? `<span class="sub-rating ${getClassBestPlayer(p?.id)} ${ratingClass}">${rating}</span>` : '';
            return `<div class="sub-row ${playersFav.includes(p.id) ? "favorite" : ""}"><span class="sub-num">${p.number || '-'}</span><span style="flex-grow:1; text-align:left; padding-left:0.8rem;">${p.name}</span>${rHtml}</div>`;
        };

        let mainContent = '';
        if (usePitch) {
            const createDot = (player, isHome) => {
                const teamData = isHome ? l[0].team : l[1].team;
                const colors = player.pos === 'G' ? teamData?.colors?.goalkeeper : teamData?.colors?.player;
                const bgColor = colors && colors.primary ? '#' + colors.primary : (isHome ? '#10b981' : '#38bdf8');
                const numColor = colors && colors.number ? '#' + colors.number : '#ffffff';
                const borderColor = colors && colors.border ? '#' + colors.border : '#0f172a';
                return { name: player.name, number: player.number, id: player.id, grid: player.grid, bg: bgColor, fg: numColor, br: borderColor, rating: getRating(player.id) };
            };

            const processTeam = (teamIndex) => {
                const xi = l[teamIndex].startXI.map(x => x.player);
                const isHome = teamIndex === 0;
                const rows = {};
                xi.forEach(p => {
                    if (!p || !p.grid) return;
                    const parts = p.grid.split(':');
                    if (parts.length < 2) return;
                    const r = parts[0];
                    if (!rows[r]) rows[r] = [];
                    rows[r].push(p);
                });

                Object.keys(rows).forEach(r => {
                    rows[r].sort((a, b) => {
                        const ga = a.grid ? parseInt(a.grid.split(':')[1]) : 0;
                        const gb = b.grid ? parseInt(b.grid.split(':')[1]) : 0;
                        return ga - gb;
                    });
                });

                return xi.map(p => {
                    if (!p || !p.grid) return {};
                    const data = createDot(p, isHome);
                    let style = '';
                    if (p.grid) {
                        const parts = p.grid.split(':');
                        const r = parseInt(parts[0]);
                        const rowPlayers = rows[r];
                        if (!rowPlayers) return {};
                        const idx = rowPlayers.indexOf(p);
                        const count = rowPlayers.length;
                        const seg = 100 / (count + 1);
                        const topPct = seg * (idx + 1);
                        const leftPct = isHome ? 6 + ((r - 1) * 9.5) : 94 - ((r - 1) * 9.5);
                        style = `left:${leftPct}%; top:${topPct}%;`;
                    }
                    return { ...data, style };
                });
            };

            const homePlayers = processTeam(0);
            const awayPlayers = processTeam(1);
            const renderRatingBadge = (p) => {
                if (!p?.rating) return '';
                const colorClass = Utils.getRatingClass(p?.rating);
                return `<div class="player-rating-badge ${getClassBestPlayer(p?.id)} ${colorClass}">${p?.rating}</div>`;
            };
            const renderDot = (p) => {
                if (!p.style) return '';
                return `<div class="pitch-player" style="${p.style}"><div class="player-dot" style="background:${p.bg}; color:${p.fg}; border-color:${p.br}">${p.number}</div>${renderRatingBadge(p)}<div class="player-name">${(p.name || '').split(' ').pop()}</div></div>`;
            };
            mainContent = `
                <div class="soccer-pitch">
                    <div class="pitch-fomation home">${l[0].formation || ''}</div>
                    <div class="pitch-fomation away">${l[1].formation || ''}</div>
                    <div class="pitch-line pitch-center-line"></div>
                    <div class="pitch-line pitch-center-circle"></div>
                    <div class="pitch-line pitch-penalty-area-left"></div>
                    <div class="pitch-line pitch-penalty-area-right"></div>
                    ${homePlayers.map(renderDot).join('')}
                    ${awayPlayers.map(renderDot).join('')}
                </div>`;
        } else {
            const home_xi = l[0]?.startXI?.map ? l[0].startXI.map(s => renderListRow(s.player)).join('') : '-';
            const away_xi = l[1]?.startXI?.map ? l[1].startXI.map(s => renderListRow(s.player)).join('') : '-';
            mainContent = `
                <div class="subs-container" style="border-top:none; margin-top:0; padding-top:0;">
                    <div class="subs-team"><h4>${l[0].team.name} Starting XI</h4>${home_xi}</div>
                    <div class="subs-team"><h4>${l[1].team.name} Starting XI</h4>${away_xi}</div>
                </div>`;
        }

        const renderSubsList = (teamIdx) => l[teamIdx]?.substitutes?.map(s => renderListRow(s.player)).join('');
        return `
        <div class="scrollable-content focusable" tabindex="0">${mainContent}
            <div class="subs-container">
                <div class="subs-team"><h4>${l[0].team.name} Substitutes</h4>${renderSubsList(0) || "-"}</div>
                <div class="subs-team"><h4>${l[1].team.name} Substitutes</h4>${renderSubsList(1) || "-"}</div>
            </div>
        </div>`;
    }

    function renderStats(s) {
        if (!s || s.length < 2) return '<div class="scrollable-content focusable" tabindex="0" style="padding:2rem;text-align:center;">No match statistics available yet.</div>';
        const homeStats = s[0].statistics || [];
        const awayStats = s[1].statistics || [];

        let html = `<div class="scrollable-content focusable" tabindex="0" style="padding: 1.5rem 2rem 3rem;"><div style="max-width:860px; margin:0 auto;">`;
        for (const [groupName, statsList] of Object.entries(STAT_GROUPS)) {
            const hasData = statsList.some(type => homeStats.find(st => st.type === type));
            if (hasData) {
                html += `<h3 class="stats-tite">${groupName}</h3>`;
                statsList.forEach(type => {
                    const hStat = homeStats.find(st => st.type === type);
                    const aStat = awayStats.find(st => st.type === type);
                    if (hStat && aStat) {
                        const hVal = hStat.value ?? 0;
                        const aVal = aStat.value ?? 0;
                        html += renderStatBar(type, hVal, aVal);
                    }
                });
            }
        }
        html += `</div></div>`;
        return html;
    }

    function renderH2H(h, teamHome, teamAway) {
        if (!h || h.length === 0) return '<div class="scrollable-content focusable" tabindex="0" style="padding:2rem;text-align:center;">No previous Head-to-Head fixtures found.</div>';
        let homeWins = 0, awayWins = 0, draws = 0;
        h.forEach(m => {
            if (m.goals.home === null || m.goals.away === null) return;
            const hGoal = m.goals.home ?? 0;
            const aGoal = m.goals.away ?? 0;
            if (hGoal === aGoal) draws++;
            else {
                const winnerId = hGoal > aGoal ? m.teams.home.id : m.teams.away.id;
                if (winnerId === teamHome.id) homeWins++;
                else if (winnerId === teamAway.id) awayWins++;
            }
        });

        return `
            <div class="scrollable-content focusable" tabindex="0" style="padding: 1rem 1.5rem 3rem;">
                <div class="h2h-banner">
                    <div class="h2h-side">${Utils.ImageLoader.tag(teamHome.logo, teamHome.name, 'h2h-crest')}<span class="h2h-win-home">${homeWins} Wins</span></div>
                    <div class="h2h-draws">${draws} Draws</div>
                    <div class="h2h-side"><span class="h2h-win-away">${awayWins} Wins</span>${Utils.ImageLoader.tag(teamAway.logo, teamAway.name, 'h2h-crest')}</div>
                </div>
                <div class="matches-container stage-matches">${h.map(m => card(m)).join('')}</div>
            </div>`;
    }

    function renderStandings(s) {
        if (!s || !s.length) return '<div class="scrollable-content focusable" tabindex="0" style="padding:2rem;text-align:center;">No Standings Available.</div>';
        let html = '<div class="scrollable-content focusable" tabindex="0" style="padding: 0.5rem 1.5rem 2.5rem;">';
        html += '<div class="standings-hint">Press OK or click any team row to toggle Favorite (★)</div>';
        const teamsFav = new Set((State.appConfig.favorite_teams || []).map(t => Number(t.id)));

        s.forEach(group => {
            const group_html = group.map(t => {
                const isFav = teamsFav.has(Number(t.team.id));
                const safeName = String(t.team.name || '').replace(/"/g, '&quot;');
                const safeLogo = String(t.team.logo || '').replace(/"/g, '&quot;');
                return `
                <tr class="standings-team-row focusable ${isFav ? 'favorite' : ''}"
                    tabindex="0"
                    role="button"
                    aria-label="${safeName}, rank ${t.rank}, ${t.points} points. Press OK to favorite"
                    data-action="toggle-fav-team"
                    data-team-id="${t.team.id}"
                    data-team-name="${safeName}"
                    data-team-logo="${safeLogo}">
                    <td class="col-rank">${t.rank}</td>
                    <td class="col-team">
                        <div class="standings-team-cell">
                            ${Utils.ImageLoader.tag(t.team.logo, t.team.name, 'standings-crest')}
                            <span class="standings-team-name">${t.team.name}</span>
                            <span class="team-fav-star ${isFav ? 'active' : ''}">★</span>
                        </div>
                    </td>
                    <td>${t.all.played}</td>
                    <td>${t.all.win}</td>
                    <td>${t.all.draw}</td>
                    <td>${t.all.lose}</td>
                    <td>${t.goalsDiff > 0 ? `+${t.goalsDiff}` : t.goalsDiff}</td>
                    <td class="col-pts"><b>${t.points}</b></td>
                </tr>`;
            }).join('');

            if (s.length > 1 && group[0]?.group) {
                html += `<h3 class="standings-group-title">${group[0].group}</h3>`;
            }
            html += `
            <table class="standings-table">
                <thead>
                    <tr>
                        <th style="width:6%">#</th>
                        <th style="text-align:left">Club (Click/OK to ★ Fav)</th>
                        <th style="width:8%">P</th>
                        <th style="width:8%">W</th>
                        <th style="width:8%">D</th>
                        <th style="width:8%">L</th>
                        <th style="width:9%">GD</th>
                        <th style="width:9%">Pts</th>
                    </tr>
                </thead>
                <tbody>${group_html}</tbody>
            </table>`;
        });
        html += '</div>';
        return html;
    }

    function renderPlayerStats(data, type) {
        if (!data || !data.length) return '<div class="scrollable-content focusable" tabindex="0" style="padding:2rem;text-align:center;">No Player Stats Available.</div>';
        const posMap = { "Goalkeeper": "GK", "Defender": "DF", "Midfielder": "MF", "Attacker": "FW" };
        const mainStat = type === 'goals' ? 'Goals' : 'Assists';
        const playersFav = (State.appConfig.favorite_players || []).map(t => Number(t.id));

        return `<div class="scrollable-content focusable" tabindex="0" style="padding: 0.5rem 1.5rem 2.5rem;">
            <table class="standings-table player-stats-table" data-type="${type}">
                <thead>
                    <tr>
                        <th style="width:6%">#</th>
                        <th style="text-align:left">Player</th>
                        <th class="focusable clickable sort-header" tabindex="0" data-sort="pos">Pos</th>
                        <th class="focusable clickable sort-header" tabindex="0" data-sort="app">Apps</th>
                        <th class="focusable clickable sort-header" tabindex="0" data-sort="rating">Rating</th>
                        <th class="focusable clickable sort-header" tabindex="0" data-sort="shots">Shots</th>
                        <th class="focusable clickable sort-header" tabindex="0" data-sort="main">${mainStat}</th>
                    </tr>
                </thead>
                <tbody>${data.map((item, index) => {
                    const p = item?.player || {};
                    const s = item?.statistics?.[0] || {};
                    const pos = posMap[s?.games?.position] || s?.games?.position?.substring(0, 3) || '-';
                    const rating = s?.games?.rating ? parseFloat(s.games.rating).toFixed(1) : '-';
                    const shots = s?.shots?.total === null || s?.shots?.total === undefined ? '-' : `${s.shots.on || 0}/${s.shots.total}`;
                    const mainVal = type === 'goals' ? (s?.goals?.total || 0) : (s?.goals?.assists || 0);
                    const natStr = p.nationality ? p.nationality.substring(0, 3).toUpperCase() : '';
                    const ratingClass = Utils.getRatingClass(rating);
                    return `
                    <tr class="${playersFav.includes(Number(p.id)) ? "favorite" : ""}">
                        <td>${index + 1}</td>
                        <td class="player-info-cell">
                            <div class="player-info-avatar">
                                ${Utils.ImageLoader.tag(s?.team?.logo, s?.team?.name, 'player-avatar-team-logo-small')}
                                ${Utils.ImageLoader.tag(p.photo, p.name, 'player-avatar-photo-small')}
                            </div>
                            <div style="line-height:1.25">
                                <div style="font-weight:700;">${p.name}</div>
                                <div style="font-size:0.85em; color:#94a3b8;">${s?.team?.name || ''} ${natStr ? `· ${natStr}` : ''}</div>
                            </div>
                        </td>
                        <td>${pos}</td>
                        <td>${s?.games?.appearences || 0}</td>
                        <td><span class="sub-rating ${ratingClass}">${rating}</span></td>
                        <td>${shots}</td>
                        <td class="col-pts"><b>${mainVal}</b></td>
                    </tr>`;
                }).join('')}</tbody>
            </table></div>`;
    }

    return {
        card,
        renderKnockout,
        renderMatchesByStage,
        renderStatBar,
        renderPredictions,
        renderEvents,
        renderLineups,
        renderStats,
        renderH2H,
        renderStandings,
        renderPlayerStats
    };
})();
