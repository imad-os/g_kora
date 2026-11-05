"use strict";

/**
 * Navigation module for My PC Smart TV & Gamepad
 * Receives actions exclusively from MyPC SDK (onInput) - no own keydown listeners!
 */
const Navigation = (function() {
    let focusableSelector = '.focusable';
    let currentFocus = null;
    let activeScope = null; 
    let scrollThrottle = null;
    let scrollHold = { active: false, el: null, dir: 0, raf: 0, lastTs: 0 };

    function init() {
        // Optional mouse hover support for desktop browsers
        document.addEventListener('mouseover', (e) => {
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

    function scan() {
        const root = activeScope || document.body;

        if (currentFocus && document.body.contains(currentFocus)) {
            if (!activeScope || activeScope.contains(currentFocus)) return;
        }

        if (root === document.body) {
            const alert = document.getElementById('live-alert');
            if (alert && alert.classList.contains('visible')) {
                focus(alert);
                return;
            }

            let candidate = document.querySelector('#content-container .tab-button.active');
            if (!candidate) candidate = document.querySelector('#content-container .focusable');

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

    function tryAccountGridMove(direction, rect) {
        const accountPage = currentFocus ? currentFocus.closest('.account-page') : null;
        if (!accountPage) return false;
        if (direction !== 'Up' && direction !== 'Down') return false;

        const sections = Array.from(accountPage.querySelectorAll('.account-section'));
        if (!sections.length) return false;

        const currentSection = currentFocus.closest('.account-section');
        if (!currentSection) return false;

        const visibleFocusable = (root) => Array.from(root.querySelectorAll(focusableSelector))
            .filter(el => el !== currentFocus && el.offsetParent !== null);

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        {
            const inSection = visibleFocusable(currentSection);
            const candidates = inSection.filter(el => {
                const r = el.getBoundingClientRect();
                const elCy = r.top + r.height / 2;
                if (direction === 'Down') return elCy > cy + 2;
                return elCy < cy - 2;
            });

            if (candidates.length) {
                candidates.sort((a, b) => {
                    const ra = a.getBoundingClientRect();
                    const rb = b.getBoundingClientRect();
                    const aCy = ra.top + ra.height / 2;
                    const bCy = rb.top + rb.height / 2;
                    const dyA = Math.abs(aCy - cy);
                    const dyB = Math.abs(bCy - cy);
                    if (dyA !== dyB) return dyA - dyB;
                    const aCx = ra.left + ra.width / 2;
                    const bCx = rb.left + rb.width / 2;
                    return Math.abs(aCx - cx) - Math.abs(bCx - cx);
                });

                focus(candidates[0]);
                return true;
            }
        }

        const idx = sections.indexOf(currentSection);
        const targetIdx = direction === 'Down' ? idx + 1 : idx - 1;
        if (targetIdx < 0 || targetIdx >= sections.length) return false;

        const targetSection = sections[targetIdx];
        let targets = [];
        const grid = targetSection.querySelector('.fav-grid');
        if (grid) targets = visibleFocusable(grid);

        if (!targets.length) {
            const header = targetSection.querySelector('.account-section-header');
            if (header) targets = visibleFocusable(header);
        }

        if (!targets.length) return false;

        const best = findClosestX(targets, rect) || targets[0];
        if (best) {
            focus(best);
            return true;
        }
        return false;
    }

    function move(direction) {
        if (!currentFocus) { scan(); return; }

        const rect = currentFocus.getBoundingClientRect();
        const currentRail = currentFocus.closest('.rail');
        const currentSidebar = currentFocus.closest('.sidebar-menu');
        const currentRow = currentFocus.closest('.row-section');
        const isHeader = currentFocus.classList.contains('row-header-content') || currentFocus.closest('.row-header');

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
                        // Move to sidebar from first item
                        const sidebarItem = document.querySelector('#sidebar .active') || document.querySelector('#sidebar .focusable');
                        if (sidebarItem) focus(sidebarItem);
                    }
                    return;
                }
            }
        }

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
                    } else {
                        if (currentRowIdx < allRows.length - 1) {
                            targetRow = allRows[currentRowIdx + 1];
                            targetIsHeader = true;
                        }
                    }
                } else if (direction === 'Up') {
                    if (isHeader) {
                        if (currentRowIdx > 0) {
                            targetRow = allRows[currentRowIdx - 1];
                            targetIsHeader = false;
                        } else {
                            const dateHeader = document.getElementById('date-header-wrapper');
                            if (dateHeader) {
                                const headerFocusable = dateHeader.querySelector(focusableSelector);
                                if (headerFocusable) { focus(headerFocusable); return; }
                            }
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
            }

            if (currentRail) return;
            if (tryAccountGridMove(direction, rect)) return;
        }

        // Generic spatial navigation
        let root = activeScope || document.body;
        if (currentSidebar) root = document.querySelector('#sidebar');

        if (activeScope && (direction === 'Down' || direction === 'Up')) {
            const allInScope = Array.from(activeScope.querySelectorAll(focusableSelector));
            const currentIdx = allInScope.indexOf(currentFocus);
            if (currentIdx !== -1) {
                if (direction === 'Down' && currentIdx < allInScope.length - 1) { focus(allInScope[currentIdx + 1]); return; }
                if (direction === 'Up' && currentIdx > 0) { focus(allInScope[currentIdx - 1]); return; }
            }
        }

        const candidates = Array.from(root.querySelectorAll(focusableSelector)).filter(el =>
            el !== currentFocus && el.offsetParent !== null
        );

        let bestCandidate = null;
        let minDistance = Infinity;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        for (const el of candidates) {
            const r = el.getBoundingClientRect();
            const elCx = r.left + r.width / 2;
            const elCy = r.top + r.height / 2;

            if (direction === 'Down' && elCy <= cy) continue;
            if (direction === 'Up' && elCy >= cy) continue;
            if (direction === 'Right' && elCx <= cx) continue;
            if (direction === 'Left' && elCx >= cx) continue;

            const xDist = Math.abs(elCx - cx);
            const yDist = Math.abs(elCy - cy);

            let dist = Infinity;
            if (direction === 'Left' || direction === 'Right') {
                dist = Math.abs((direction === 'Right' ? r.left : r.right) - (direction === 'Right' ? rect.right : rect.left)) + (yDist * 3);
            } else {
                dist = Math.abs((direction === 'Down' ? r.top : r.bottom) - (direction === 'Down' ? rect.bottom : rect.top)) + (xDist * 3);
            }

            if (dist < minDistance) {
                minDistance = dist;
                bestCandidate = el;
            }
        }

        if (bestCandidate && bestCandidate.closest('#sidebar')) {
            if (currentFocus && currentFocus.closest('.page-container')) return;
        }

        if (bestCandidate) focus(bestCandidate);
    }

    /**
     * Dispatch MyPC SDK Actions directly into UI navigation
     */
    function handleAction(action, pressed, repeat, dev) {
        if (!pressed) {
            if (action === 'up' || action === 'down') {
                stopScrollHold();
            }
            return;
        }

        const current = currentFocus || document.activeElement;

        // Handle full-screen tab modal
        const fsContent = document.querySelector('.tab-content.full-screen-mode');
        if (fsContent && (action === 'cancel' || action === 'b')) {
            fsContent.classList.remove('full-screen-mode');
            const btn = fsContent.querySelector('.fs-close-btn');
            if (btn) btn.remove();
            const lnTab = document.querySelector('.tab-button[data-tab="ln"]');
            if (lnTab) focus(lnTab);
            return;
        }

        // 4-Way Directions
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

        // Confirmation / Activation (OK / Gamepad B / Enter)
        if (action === 'ok' || action === 'confirm') {
            if (current) {
                current.click();
            }
            return;
        }

        // Cancel / Back (Gamepad A / Remote Back / Esc)
        if (action === 'cancel' || action === 'b') {
            if (activeScope) {
                const closeBtn = activeScope.querySelector('.modal-close');
                if (closeBtn) closeBtn.click();
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

        // Date Navigation: Next Day
        if (action === mappings.dateNext || (mappings.dateNext === 'pageUp' && action === 'pageUp')) {
            if (window.AppState) {
                window.AppState.currentDate.setDate(window.AppState.currentDate.getDate() + 1);
                window.AppState.matchesCache = null;
                const dateHeader = document.getElementById('date-header');
                if (dateHeader) dateHeader.textContent = window.AppServices.Helpers.formatDate(window.AppState.currentDate);
                window.AppRouter.go('home');
            }
            return;
        }

        // Date Navigation: Prev Day
        if (action === mappings.datePrev || (mappings.datePrev === 'pageDown' && action === 'pageDown')) {
            if (window.AppState) {
                window.AppState.currentDate.setDate(window.AppState.currentDate.getDate() - 1);
                window.AppState.matchesCache = null;
                const dateHeader = document.getElementById('date-header');
                if (dateHeader) dateHeader.textContent = window.AppServices.Helpers.formatDate(window.AppState.currentDate);
                window.AppRouter.go('home');
            }
            return;
        }

        // Track Match Toggle
        if (action === mappings.trackToggle || (mappings.trackToggle === 'run' && action === 'run')) {
            if (current && current.classList.contains('match-card') && current.dataset.id) {
                const mid = parseInt(current.dataset.id);
                if (mid && window.Utils) {
                    if (window.Utils.isTracked(mid)) {
                        window.Utils.removeTracked(mid);
                        const ind = current.querySelector('.track-indicator');
                        if (ind) ind.remove();
                        window.AppServices.Helpers.showToast('Match untracked', 'info');
                    } else {
                        window.Utils.addTracked(mid);
                        const dot = document.createElement('div');
                        dot.className = 'track-indicator';
                        current.appendChild(dot);
                        window.AppServices.Helpers.showToast('Tracking match for live alerts', 'success');
                    }
                }
                return;
            }
        }

        // Favorite Toggle
        if (action === mappings.favToggle || action === 'y') {
            if (current && current.classList.contains('fav-toggle')) {
                current.click();
            } else if (current && current.classList.contains('row-header-content')) {
                const toggle = current.parentElement.querySelector('.fav-toggle');
                if (toggle) toggle.click();
            } else {
                // Quick toggle live mode
                if (window.AppState) {
                    window.AppState.isLiveMode = !window.AppState.isLiveMode;
                    window.AppState.matchesCache = null;
                    window.AppServices.Helpers.showToast(window.AppState.isLiveMode ? 'Live matches only' : 'All matches', 'info');
                    window.AppRouter.go('home');
                }
            }
            return;
        }

        // Menu button (Start / +)
        if (action === 'menu') {
            const sidebar = document.getElementById('sidebar');
            const activeNav = sidebar ? (sidebar.querySelector('.active') || sidebar.querySelector('.focusable')) : null;
            if (activeNav) focus(activeNav);
            return;
        }
    }

    return { init, scan, focus, setScope, move, handleAction };
})();

window.Navigation = Navigation;
