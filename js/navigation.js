"use strict";

/**
 * Navigation module for My PC Smart TV, Remote & Gamepad
 */
const Navigation = (function() {
    let focusableSelector = '.focusable';
    let currentFocus = null;
    let activeScope = null;
    let scrollHold = { active: false, el: null, dir: 0, raf: 0, lastTs: 0 };
    let lastActionTimestamps = {};

    function initKeyboardBridge() {
        function onKey(e, isDown) {
            if (window.ButtonMapper && typeof window.ButtonMapper.isListening === 'function' && window.ButtonMapper.isListening()) {
                if (!isDown) return;
                e.preventDefault();
                e.stopPropagation();
                const code = e.keyCode || e.which;
                if (code === 27 || code === 10009) {
                    window.ButtonMapper.cancel(false);
                    return;
                }
                let mappedKey = e.key;
                if (code === 33 || code === 427 || e.key === 'PageUp') mappedKey = 'pageUp';
                else if (code === 34 || code === 428 || e.key === 'PageDown') mappedKey = 'pageDown';
                else if (e.key === 'x' || e.key === 'X') mappedKey = 'run';
                else if (e.key === 'y' || e.key === 'Y') mappedKey = 'y';
                else if (e.key === 'ArrowRight' || code === 39) mappedKey = 'right';
                else if (e.key === 'ArrowLeft' || code === 37) mappedKey = 'left';
                else if (e.key === 'ArrowUp' || code === 38) mappedKey = 'up';
                else if (e.key === 'ArrowDown' || code === 40) mappedKey = 'down';
                else if (e.key === 'Enter' || code === 13) mappedKey = 'ok';
                else if (e.key === ' ' || code === 32) mappedKey = 'Space';
                else if (e.key && e.key.length === 1) mappedKey = e.key.toUpperCase();
                window.ButtonMapper.recordInput(mappedKey, 'keys');
                return;
            }

            const tag = e.target && e.target.tagName;
            const isTextInput = (tag === 'INPUT' && !/^(button|checkbox|radio|submit)$/i.test(e.target.type)) || tag === 'TEXTAREA';

            const code = e.keyCode || e.which;
            const key = e.key;
            let action = null;

            if (key === 'ArrowLeft' || code === 37 || (!isTextInput && (key === 'a' || key === 'A'))) action = 'left';
            else if (key === 'ArrowRight' || code === 39 || (!isTextInput && (key === 'd' || key === 'D'))) action = 'right';
            else if (key === 'ArrowUp' || code === 38 || (!isTextInput && (key === 'w' || key === 'W'))) action = 'up';
            else if (key === 'ArrowDown' || code === 40 || (!isTextInput && (key === 's' || key === 'S'))) action = 'down';
            else if (key === 'Enter' || code === 13 || (!isTextInput && (key === ' ' || code === 32 || key === 'k' || key === 'K'))) action = 'ok';
            else if (key === 'Escape' || code === 27 || code === 10009 || (!isTextInput && (key === 'Backspace' || code === 8)) || key === 'XF86Back') action = 'cancel';
            else if (key === 'PageUp' || code === 33 || code === 427 || (!isTextInput && (key === 'e' || key === 'E'))) action = 'pageUp';
            else if (key === 'PageDown' || code === 34 || code === 428 || (!isTextInput && (key === 'q' || key === 'Q'))) action = 'pageDown';
            else if (!isTextInput && (key === 'x' || key === 'X')) action = 'run';
            else if (!isTextInput && (key === 'y' || key === 'Y' || key === 'c' || key === 'C')) action = 'y';
            else if (!isTextInput && (key === 'm' || key === 'M' || key === 'Tab' || code === 9)) action = 'menu';

            if (action) {
                if (['left', 'right', 'up', 'down', 'ok', 'pageUp', 'pageDown', 'menu', 'run', 'y'].includes(action) || code === 10009) {
                    if (!isTextInput || action === 'cancel') {
                        e.preventDefault();
                    }
                }
                handleAction(action, isDown, e.repeat, 'keys');
            }
        }

        window.addEventListener('keydown', (e) => onKey(e, true));
        window.addEventListener('keyup', (e) => onKey(e, false));
    }

    function init() {
        initKeyboardBridge();

        document.addEventListener('pointerdown', (e) => {
            const target = e.target.closest(focusableSelector);
            if (target && target !== currentFocus) {
                focus(target, false);
            }
        });
    }

    function stopScrollHold() {
        scrollHold.active = false;
        scrollHold.el = null;
        scrollHold.dir = 0;
        scrollHold.lastTs = 0;
        if (scrollHold.raf) {
            cancelAnimationFrame(scrollHold.raf);
            scrollHold.raf = 0;
        }
    }

    function startScrollHold(el, dir) {
        if (!el) return;
        if (el.style.scrollBehavior !== 'auto') el.style.scrollBehavior = 'auto';

        scrollHold.el = el;
        scrollHold.dir = dir;
        if (scrollHold.active) return;
        scrollHold.active = true;
        scrollHold.lastTs = 0;

        const ratePxPerMs = 0.65;
        const tick = (ts) => {
            if (!scrollHold.active || !scrollHold.el) return;
            if (!scrollHold.lastTs) scrollHold.lastTs = ts;
            const dt = Math.min(32, ts - scrollHold.lastTs);
            scrollHold.lastTs = ts;

            const step = dt * ratePxPerMs * scrollHold.dir;
            const maxScroll = scrollHold.el.scrollHeight - scrollHold.el.clientHeight;

            if (maxScroll <= 0) {
                stopScrollHold();
                return;
            }

            const next = Math.max(0, Math.min(maxScroll, scrollHold.el.scrollTop + step));
            scrollHold.el.scrollTop = next;

            if ((scrollHold.dir < 0 && next <= 0) || (scrollHold.dir > 0 && next >= maxScroll)) {
                stopScrollHold();
                return;
            }

            scrollHold.raf = requestAnimationFrame(tick);
        };

        scrollHold.raf = requestAnimationFrame(tick);
    }

    function setScope(element) {
        activeScope = element;
        if (element) {
            const first = element.querySelector(focusableSelector);
            if (first) focus(first);
        }
    }

    function scan(force = false) {
        const root = activeScope || document.body;

        if (!force && currentFocus && document.body.contains(currentFocus)) {
            if (!activeScope || activeScope.contains(currentFocus)) return;
        }

        if (root === document.body) {
            const alert = document.getElementById('live-alert');
            if (alert && alert.classList.contains('visible')) {
                focus(alert);
                return;
            }

            let candidate = document.querySelector('#content-container .tab-button.active');
            if (!candidate) candidate = document.querySelector('#content-container .match-card.focusable');
            if (!candidate) candidate = document.querySelector('#content-container .focusable:not([style*="display: none"])');

            if (candidate && candidate.offsetParent !== null) {
                focus(candidate);
                return;
            }
        }

        const visible = root.querySelector(focusableSelector);
        if (visible) focus(visible);
    }

    function focus(element, scroll = true) {
        if (!element) return;
        if (currentFocus) currentFocus.classList.remove('focused');

        currentFocus = element;
        currentFocus.classList.add('focused');
        currentFocus.focus({ preventScroll: true });

        if (scroll) {
            element.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
        }
    }

    function findClosestX(targetList, referenceRect) {
        let best = null;
        let minDiff = Infinity;
        const refX = referenceRect.left + (referenceRect.width / 2);

        targetList.forEach(el => {
            const r = el.getBoundingClientRect();
            const elX = r.left + (r.width / 2);
            const diff = Math.abs(elX - refX);
            if (diff < minDiff) {
                minDiff = diff;
                best = el;
            }
        });
        return best;
    }

    function move(direction) {
        if (!currentFocus || !document.body.contains(currentFocus)) {
            scan(true);
            return;
        }

        const rect = currentFocus.getBoundingClientRect();
        const currentSidebar = currentFocus.closest('#sidebar');
        const currentRail = currentFocus.closest('.rail');
        const currentRow = currentFocus.closest('.row-section');
        const currentDateBar = currentFocus.closest('#date-header-wrapper');
        const isHeader = currentFocus.classList.contains('row-header-content') || currentFocus.closest('.row-header');

        // 1. SIDEBAR
        if (currentSidebar) {
            const menuItems = Array.from(document.querySelectorAll('#sidebar .menu-item.focusable'));
            const idx = menuItems.indexOf(currentFocus);

            if (direction === 'Down') {
                if (idx < menuItems.length - 1) focus(menuItems[idx + 1]);
                return;
            }
            if (direction === 'Up') {
                if (idx > 0) focus(menuItems[idx - 1]);
                return;
            }
            if (direction === 'Right') {
                const contentItem = document.querySelector('#content-container .tab-button.active') ||
                                    document.querySelector('#content-container .match-card.focusable') ||
                                    document.querySelector('#content-container .focusable:not([style*="display: none"])');
                if (contentItem) focus(contentItem);
                return;
            }
            if (direction === 'Left') return;
        }

        // 2. TOP DATE BAR
        if (currentDateBar) {
            const barBtns = Array.from(currentDateBar.querySelectorAll(focusableSelector));
            const idx = barBtns.indexOf(currentFocus);
            if (direction === 'Right' && idx < barBtns.length - 1) {
                focus(barBtns[idx + 1]);
                return;
            }
            if (direction === 'Left') {
                if (idx > 0) focus(barBtns[idx - 1]);
                else {
                    const sidebarItem = document.querySelector('#sidebar .active') || document.querySelector('#sidebar .focusable');
                    if (sidebarItem) focus(sidebarItem);
                }
                return;
            }
            if (direction === 'Down') {
                const firstContent = document.querySelector('#content-container .match-card.focusable') ||
                                     document.querySelector('#content-container .focusable');
                if (firstContent) focus(firstContent);
                return;
            }
        }

        // 3. HORIZONTAL RAILS
        if (direction === 'Left' || direction === 'Right') {
            if (currentRail) {
                const siblings = Array.from(currentRail.querySelectorAll(focusableSelector));
                const idx = siblings.indexOf(currentFocus);

                if (direction === 'Right') {
                    if (idx < siblings.length - 1) focus(siblings[idx + 1]);
                    return;
                }
                if (direction === 'Left') {
                    if (idx > 0) {
                        focus(siblings[idx - 1]);
                    } else {
                        const sidebarItem = document.querySelector('#sidebar .active') || document.querySelector('#sidebar .focusable');
                        if (sidebarItem) focus(sidebarItem);
                    }
                    return;
                }
            }
        }

        // 4. VERTICAL ROWS
        if (direction === 'Up' || direction === 'Down') {
            if (currentRow) {
                const allRows = Array.from(document.querySelectorAll('.row-section'));
                const currentRowIdx = allRows.indexOf(currentRow);

                let targetRow = null;
                let targetIsHeader = false;

                if (direction === 'Down') {
                    if (isHeader) {
                        targetRow = currentRow;
                        targetIsHeader = false;
                    } else if (currentRowIdx < allRows.length - 1) {
                        targetRow = allRows[currentRowIdx + 1];
                        targetIsHeader = true;
                    } else {
                        const loadAllBtn = document.getElementById('btn-load-all');
                        if (loadAllBtn) { focus(loadAllBtn); return; }
                    }
                } else if (direction === 'Up') {
                    if (isHeader) {
                        if (currentRowIdx > 0) {
                            targetRow = allRows[currentRowIdx - 1];
                            targetIsHeader = false;
                        } else {
                            const dateBarBtn = document.querySelector('#date-header-wrapper .focusable');
                            if (dateBarBtn) { focus(dateBarBtn); return; }
                        }
                    } else {
                        targetRow = currentRow;
                        targetIsHeader = true;
                    }
                }

                if (targetRow) {
                    if (targetIsHeader) {
                        const header = targetRow.querySelector('.row-header-content.focusable');
                        if (header) { focus(header); return; }
                    } else {
                        let candidates = Array.from(targetRow.querySelectorAll('.rail .focusable'));
                        if (candidates.length === 0) candidates = Array.from(targetRow.querySelectorAll('.focusable'));
                        candidates = candidates.filter(c => !c.classList.contains('row-header-content'));
                        if (candidates.length > 0) {
                            const best = findClosestX(candidates, rect);
                            if (best) { focus(best); return; }
                        }
                    }
                }
                return;
            }
        }

        // 5. GENERIC 2D SPATIAL NAVIGATION
        const root = activeScope || document.getElementById('main-view') || document.body;
        const candidates = Array.from(root.querySelectorAll(focusableSelector)).filter(el =>
            el !== currentFocus && el.offsetParent !== null && !el.closest('#sidebar')
        );

        let bestCandidate = null;
        let minDistance = Infinity;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        for (const el of candidates) {
            const r = el.getBoundingClientRect();
            const elCx = r.left + r.width / 2;
            const elCy = r.top + r.height / 2;

            if (direction === 'Down' && elCy <= cy + 4) continue;
            if (direction === 'Up' && elCy >= cy - 4) continue;
            if (direction === 'Right' && elCx <= cx + 4) continue;
            if (direction === 'Left' && elCx >= cx - 4) continue;

            const xDist = Math.abs(elCx - cx);
            const yDist = Math.abs(elCy - cy);

            let dist = Infinity;
            if (direction === 'Left' || direction === 'Right') {
                dist = Math.abs((direction === 'Right' ? r.left : r.right) - (direction === 'Right' ? rect.right : rect.left)) + (yDist * 2.2);
            } else {
                dist = Math.abs((direction === 'Down' ? r.top : r.bottom) - (direction === 'Down' ? rect.bottom : rect.top)) + (xDist * 1.8);
            }

            if (dist < minDistance) {
                minDistance = dist;
                bestCandidate = el;
            }
        }

        if (bestCandidate) {
            focus(bestCandidate);
            return;
        }

        if (direction === 'Left' && !currentSidebar) {
            const sidebarItem = document.querySelector('#sidebar .active') || document.querySelector('#sidebar .focusable');
            if (sidebarItem) focus(sidebarItem);
        }
    }

    function matchesMapping(configured, action) {
        if (!configured || !action) return false;
        const c = String(configured).toLowerCase();
        const a = String(action).toLowerCase();
        if (c === a) return true;
        if ((c === 'pageup' || c === 'rb') && (a === 'pageup' || a === 'rb')) return true;
        if ((c === 'pagedown' || c === 'lb') && (a === 'pagedown' || a === 'lb')) return true;
        if ((c === 'run' || c === 'x') && (a === 'run' || a === 'x')) return true;
        if (c === 'y' && a === 'y') return true;
        return false;
    }

    async function handleAction(rawAction, pressed, repeat, dev) {
        if (!pressed) {
            if (rawAction === 'up' || rawAction === 'down') {
                stopScrollHold();
            }
            return;
        }

        if (window.ButtonMapper && typeof window.ButtonMapper.isListening === 'function' && window.ButtonMapper.isListening()) {
            window.ButtonMapper.recordInput(rawAction, dev);
            return;
        }

        if (window.ButtonMapper && window.ButtonMapper.lastRecordTime && (Date.now() - window.ButtonMapper.lastRecordTime < 400)) {
            return;
        }

        let action = rawAction;
        if (action === 'confirm' || action === 'jump') action = 'ok';
        if (action === 'b') action = 'cancel';

        const now = Date.now();
        const minInterval = (action === 'ok') ? 220 : ((action === 'cancel' || action === 'menu') ? 200 : 110);
        if (!repeat) {
            if (now - (lastActionTimestamps[action] || 0) < minInterval) {
                return;
            }
            lastActionTimestamps[action] = now;
        }

        const current = currentFocus || document.activeElement;

        if (action === 'left') { move('Left'); return; }
        if (action === 'right') { move('Right'); return; }
        if (action === 'up') {
            if (current && current.classList && current.classList.contains('scrollable-content')) {
                startScrollHold(current, -1);
                return;
            }
            move('Up');
            return;
        }
        if (action === 'down') {
            if (current && current.classList && current.classList.contains('scrollable-content')) {
                startScrollHold(current, 1);
                return;
            }
            move('Down');
            return;
        }

        if (action === 'ok') {
            if (current) {
                current.click();
            }
            return;
        }

        if (action === 'cancel') {
            if (activeScope) {
                const closeBtn = activeScope.querySelector('.modal-close');
                if (closeBtn) closeBtn.click();
            } else if (window.AppRouter && typeof window.AppRouter.back === 'function') {
                window.AppRouter.back();
            } else {
                document.dispatchEvent(new CustomEvent('nav-back'));
            }
            return;
        }

        const mappings = (window.AppServices && window.AppServices.State && window.AppServices.State.appConfig && window.AppServices.State.appConfig.buttonMappings) || {
            dateNext: 'pageUp',
            datePrev: 'pageDown',
            favToggle: 'y',
            trackToggle: 'run'
        };

        // Next Day
        if (matchesMapping(mappings.dateNext, action)) {
            if (window.AppState) {
                window.AppState.isLiveMode = false;
                window.AppState.currentDate.setDate(window.AppState.currentDate.getDate() + 1);
                window.AppState.matchesCache = null;
                window.AppRouter.go('home');
            }
            return;
        }

        // Prev Day
        if (matchesMapping(mappings.datePrev, action)) {
            if (window.AppState) {
                window.AppState.isLiveMode = false;
                window.AppState.currentDate.setDate(window.AppState.currentDate.getDate() - 1);
                window.AppState.matchesCache = null;
                window.AppRouter.go('home');
            }
            return;
        }

        // Track Match Toggle
        if (matchesMapping(mappings.trackToggle, action)) {
            if (current && current.classList.contains('match-card') && current.dataset.id) {
                const mid = parseInt(current.dataset.id);
                if (mid && window.Utils) {
                    if (window.Utils.isTracked(mid)) {
                        window.Utils.removeTracked(mid);
                        const ind = current.querySelector('.track-indicator');
                        if (ind) ind.remove();
                        window.AppServices.Helpers.showToast('Stopped tracking match', 'info');
                    } else {
                        window.Utils.addTracked(mid);
                        const dot = document.createElement('div');
                        dot.className = 'track-indicator';
                        current.appendChild(dot);
                        window.AppServices.Helpers.showToast('Tracking match for live goal alerts!', 'success');
                    }
                }
                return;
            }
        }

        // Favorite Shortcut Button (Y): Toggle favorite on focused match card teams, team button, or league header
        if (matchesMapping(mappings.favToggle, action)) {
            if (current && current.dataset && current.dataset.action === 'toggle-fav-team') {
                current.click();
                return;
            }
            if (current && current.classList.contains('match-card')) {
                const homeId = Number(current.dataset.homeId);
                const homeName = current.dataset.homeName || 'Home';
                const homeLogo = current.dataset.homeLogo || '';
                const awayId = Number(current.dataset.awayId);
                const awayName = current.dataset.awayName || 'Away';
                const awayLogo = current.dataset.awayLogo || '';

                if (homeId && window.AppServices?.FavoritesService) {
                    const homeFav = window.AppServices.FavoritesService.isFavorite('team', homeId);
                    const awayFav = window.AppServices.FavoritesService.isFavorite('team', awayId);
                    if (!homeFav) {
                        await window.AppServices.FavoritesService.add('team', { id: homeId, name: homeName, logo: homeLogo });
                        if (window.AppUI?.updateAllTeamFavVisuals) window.AppUI.updateAllTeamFavVisuals(homeId, true);
                        window.AppServices.Helpers.showToast(`★ Added ${homeName} to Favorites (Press Y again for ${awayName})`, 'success');
                    } else if (!awayFav && awayId) {
                        await window.AppServices.FavoritesService.add('team', { id: awayId, name: awayName, logo: awayLogo });
                        if (window.AppUI?.updateAllTeamFavVisuals) window.AppUI.updateAllTeamFavVisuals(awayId, true);
                        window.AppServices.Helpers.showToast(`★ Added ${awayName} to Favorites`, 'success');
                    } else {
                        await window.AppServices.FavoritesService.remove('team', homeId);
                        if (window.AppUI?.updateAllTeamFavVisuals) window.AppUI.updateAllTeamFavVisuals(homeId, false);
                        window.AppServices.Helpers.showToast(`Removed ${homeName} from Favorites`, 'info');
                    }
                }
                return;
            }
            if (current && current.classList.contains('fav-toggle')) {
                current.click();
                return;
            }
            if (current && current.classList.contains('row-header-content')) {
                const toggle = current.parentElement.querySelector('.fav-toggle');
                if (toggle) toggle.click();
                return;
            }
        }

        if (action === 'menu') {
            const sidebar = document.getElementById('sidebar');
            const activeNav = sidebar ? (sidebar.querySelector('.active') || sidebar.querySelector('.focusable')) : null;
            if (activeNav) focus(activeNav);
        }
    }

    return { init, scan, focus, setScope, move, handleAction };
})();

window.Navigation = Navigation;
