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

    let lastActionTimestamps = {};

    function initKeyboardBridge() {
        function onKey(e, isDown) {
            // If ButtonMapper is actively listening for a button press, intercept immediately!
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
            else if (key === 'Escape' || code === 27 || code === 10009 || key === 'Backspace' || code === 8 || key === 'j' || key === 'J' || key === 'XF86Back') action = 'cancel';
            else if (key === 'PageUp' || code === 33 || code === 427 || (!isTextInput && (key === 'e' || key === 'E'))) action = 'pageUp';
            else if (key === 'PageDown' || code === 34 || code === 428 || (!isTextInput && (key === 'q' || key === 'Q'))) action = 'pageDown';
            else if (!isTextInput && (key === 'x' || key === 'X')) action = 'run';
            else if (!isTextInput && (key === 'y' || key === 'Y' || key === 'c' || key === 'C')) action = 'y';
            else if (!isTextInput && (key === 'm' || key === 'M' || key === 'Tab' || code === 9)) action = 'menu';

            if (action) {
                if (['left','right','up','down','ok','pageUp','pageDown','menu','run','y'].includes(action) || code === 10009) {
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

        // Click/tap support for pointer devices
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
        if (!currentFocus || !document.body.contains(currentFocus)) {
            scan(true);
            return;
        }

        const rect = currentFocus.getBoundingClientRect();
        const currentSidebar = currentFocus.closest('#sidebar');
        const currentRail = currentFocus.closest('.rail');
        const currentRow = currentFocus.closest('.row-section');
        const isHeader = currentFocus.classList.contains('row-header-content') || currentFocus.closest('.row-header');

        // --- 1. SIDEBAR NAVIGATION ---
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
                // Move from sidebar into content container
                const contentItem = document.querySelector('#content-container .tab-button.active') ||
                                    document.querySelector('#content-container .focusable:not([style*="display: none"])');
                if (contentItem) {
                    focus(contentItem);
                    return;
                }
            }
            if (direction === 'Left') {
                return; // Already at left edge
            }
        }

        // --- 2. SELECT ELEMENTS (Gamepad / Remote friendly option switching) ---
        if (currentFocus.tagName === 'SELECT') {
            if (direction === 'Left') {
                if (currentFocus.selectedIndex > 0) {
                    currentFocus.selectedIndex--;
                    currentFocus.dispatchEvent(new Event('change'));
                    return;
                }
            } else if (direction === 'Right') {
                if (currentFocus.selectedIndex < currentFocus.options.length - 1) {
                    currentFocus.selectedIndex++;
                    currentFocus.dispatchEvent(new Event('change'));
                    return;
                }
            }
        }

        // --- 3. HORIZONTAL RAILS (Matches on Home) ---
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
                        // Move to active sidebar item from first card
                        const sidebarItem = document.querySelector('#sidebar .active') || document.querySelector('#sidebar .focusable');
                        if (sidebarItem) focus(sidebarItem);
                    }
                    return;
                }
            }
        }

        // --- 4. VERTICAL ROWS & SECTIONS ---
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

        // --- 5. GENERIC 2D SPATIAL NAVIGATION ---
        let root = activeScope || document.getElementById('content-container') || document.body;

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

            if (direction === 'Down' && elCy <= cy) continue;
            if (direction === 'Up' && elCy >= cy) continue;
            if (direction === 'Right' && elCx <= cx) continue;
            if (direction === 'Left' && elCx >= cx) continue;

            const xDist = Math.abs(elCx - cx);
            const yDist = Math.abs(elCy - cy);

            let dist = Infinity;
            if (direction === 'Left' || direction === 'Right') {
                dist = Math.abs((direction === 'Right' ? r.left : r.right) - (direction === 'Right' ? rect.right : rect.left)) + (yDist * 2);
            } else {
                dist = Math.abs((direction === 'Down' ? r.top : r.bottom) - (direction === 'Down' ? rect.bottom : rect.top)) + (xDist * 2);
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

        // If moving Left and nothing found in content -> move to active sidebar item
        if (direction === 'Left' && !currentSidebar) {
            const sidebarItem = document.querySelector('#sidebar .active') || document.querySelector('#sidebar .focusable');
            if (sidebarItem) {
                focus(sidebarItem);
                return;
            }
        }
    }

    /**
     * Helper to match custom button mappings (e.g. pageUp/RB, pageDown/LB, run/X, y)
     */
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

    /**
     * Dispatch MyPC SDK Actions directly into UI navigation
     */
    function handleAction(rawAction, pressed, repeat, dev) {
        if (!pressed) {
            if (rawAction === 'up' || rawAction === 'down') {
                stopScrollHold();
            }
            return;
        }

        // Intercept if ButtonMapper is actively listening for 5-second button remap!
        if (window.ButtonMapper && typeof window.ButtonMapper.isListening === 'function' && window.ButtonMapper.isListening()) {
            window.ButtonMapper.recordInput(rawAction, dev);
            return;
        }

        // Suppress trailing input events immediately following a successful button mapping
        if (window.ButtonMapper && window.ButtonMapper.lastRecordTime && (Date.now() - window.ButtonMapper.lastRecordTime < 400)) {
            return;
        }

        // Action normalization across MyPC SDK and DOM bridge
        let action = rawAction;
        if (action === 'confirm' || action === 'jump') action = 'ok';
        if (action === 'b') action = 'cancel';

        // Robust timestamp-based de-duplication
        // Prevents duplicate event triggers when MyPC standalone and DOM keydown bridge fire simultaneously,
        // and collapses dual 'confirm' + 'jump' emitted by MyPC for Enter key into a single action.
        const now = Date.now();
        const minInterval = (action === 'ok') ? 220 : ((action === 'cancel' || action === 'menu') ? 200 : 110);
        if (!repeat) {
            if (now - (lastActionTimestamps[action] || 0) < minInterval) {
                return;
            }
            lastActionTimestamps[action] = now;
        }

        const current = currentFocus || document.activeElement;

        // Handle full-screen tab modal
        const fsContent = document.querySelector('.tab-content.full-screen-mode');
        if (fsContent && (action === 'cancel')) {
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

        // Confirmation / Activation (OK / Gamepad A / Remote OK / Enter)
        if (action === 'ok') {
            if (current) {
                if (current.tagName === 'SELECT') {
                    current.selectedIndex = (current.selectedIndex + 1) % current.options.length;
                    current.dispatchEvent(new Event('change'));
                    return;
                }
                current.click();
            }
            return;
        }

        // Cancel / Back (Gamepad B / Remote Back / Esc)
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

        // Date Navigation: Next Day
        if (matchesMapping(mappings.dateNext, action)) {
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
        if (matchesMapping(mappings.datePrev, action)) {
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
        if (matchesMapping(mappings.trackToggle, action)) {
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
        if (matchesMapping(mappings.favToggle, action)) {
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
