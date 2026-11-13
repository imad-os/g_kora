"use strict";

window.Utils = (function() {
    const IMG_PLACEHOLDER =
        'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    const _imgPromises = new Map();
    const _imgLoaded = new Set();

    function preloadImage(url) {
        const u = (url || '').trim();
        if (!u) return Promise.resolve(false);
        if (_imgLoaded.has(u)) return Promise.resolve(true);
        if (_imgPromises.has(u)) return _imgPromises.get(u);

        const p = new Promise((resolve) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => { _imgLoaded.add(u); resolve(true); };
            img.onerror = () => resolve(false);
            img.src = u;
        });
        _imgPromises.set(u, p);
        return p;
    }

    function applyLazyImg(imgEl) {
        if (!imgEl || (imgEl.dataset && imgEl.dataset._lazyBound)) return;
        const url = imgEl.getAttribute('data-src') || '';
        if (!url) return;
        if (!imgEl.getAttribute('src')) imgEl.setAttribute('src', IMG_PLACEHOLDER);
        imgEl.setAttribute('decoding', 'async');
        imgEl.setAttribute('loading', 'lazy');
        imgEl.dataset._lazyBound = '1';

        const loadNow = async () => {
            imgEl.classList.add('img-loading');
            if (!imgEl.style.opacity) imgEl.style.opacity = '0';

            const ok = await preloadImage(url);
            if (!ok) {
                imgEl.classList.remove('img-loading');
                imgEl.classList.add('img-loaded');
                imgEl.style.opacity = '1';
                return;
            }

            imgEl.onload = () => {
                imgEl.classList.remove('img-loading');
                imgEl.classList.add('img-loaded');
                imgEl.style.opacity = '1';
                imgEl.onload = null;
            };
            imgEl.onerror = () => {
                imgEl.classList.remove('img-loading');
                imgEl.classList.add('img-loaded');
                imgEl.style.opacity = '1';
                imgEl.onerror = null;
            };

            imgEl.src = url;
        };

        if (!('IntersectionObserver' in window)) {
            loadNow();
            return;
        }

        ImageLoader._ensureObserver();
        ImageLoader._observer.observe(imgEl);
        imgEl._loadNow = loadNow;
    }

    const ImageLoader = {
        _observer: null,
        _ensureObserver: () => {
            if (ImageLoader._observer || !('IntersectionObserver' in window)) return;
            ImageLoader._observer = new IntersectionObserver((entries) => {
                for (const ent of entries) {
                    if (!ent.isIntersecting) continue;
                    const el = ent.target;
                    try {
                        if (el && typeof el._loadNow === 'function') el._loadNow();
                    } finally {
                        ImageLoader._observer.unobserve(el);
                    }
                }
            }, { root: null, rootMargin: '240px', threshold: 0.01 });
        },
        scan: (root) => {
            const scope = root || document;
            const imgs = scope.querySelectorAll('img[data-src]');
            imgs.forEach(applyLazyImg);
        },
        tag: (url, alt = '', className = '', extraAttrs = '') => {
            const safeAlt = String(alt || '').replace(/"/g, '&quot;');
            const safeUrl = String(url || '').replace(/"/g, '&quot;');
            const cls = (`lazy-img ${className || ''}`).trim();
            return `<img class="${cls}" src="${IMG_PLACEHOLDER}" data-src="${safeUrl}" alt="${safeAlt}" referrerpolicy="no-referrer" ${extraAttrs || ''}>`;
        }
    };

    const sounds = { goal: null, card: null, ft: null };

    function saveTrackedMatches() {
        if (!window.AppState || !window.AppState.monitoredMatches) return;
        // one save path for everything the user changes: My PC's user data (synced) + the widget / alerts bridge
        if (window.AppServices && window.AppServices.Storage) {
            window.AppServices.Storage.saveUserConfig(
                window.AppServices.State.currentUser?.uid || 'player',
                window.AppServices.State.appConfig
            );
        }
    }

    function initSounds() {
        sounds.goal = document.getElementById('snd-goal');
        sounds.card = document.getElementById('snd-whistle');
        sounds.ft = document.getElementById('snd-whistle');
        sounds.track = document.getElementById('snd-whistle');
    }

    function playSynthTone(type) {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'track') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, now); // D5
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.14); // A5
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.start(now);
                osc.stop(now + 0.23);
            } else if (type === 'untrack') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.exponentialRampToValueAtTime(349.23, now + 0.14); // F4
                gain.gain.setValueAtTime(0.14, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.21);
            } else if (type === 'goal') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, now);
                osc.frequency.setValueAtTime(659.25, now + 0.1);
                osc.frequency.setValueAtTime(783.99, now + 0.2);
                gain.gain.setValueAtTime(0.22, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.46);
            } else {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(660, now);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.21);
            }
            setTimeout(() => { try { ctx.close(); } catch (e) {} }, 600);
        } catch (e) {}
    }

    function playSound(type) {
        if (!sounds.goal) initSounds();
        playSynthTone(type);
        try {
            const audio = sounds[type] || (type === 'track' ? sounds.card : null);
            if (!audio) return;
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 0.5;
            const playPromise = audio.play();
            if (playPromise) playPromise.catch(() => {});
        } catch (e) {}
    }

    function formTimeString(status) {
        if (!status) return '';
        const extra = status.extra ? `+${status.extra}` : '';
        return `${status.elapsed || 0}${extra}'`;
    }

    function fullDate(date) {
        const matchDate = new Date(date);
        return `${matchDate.getFullYear()}/${String(matchDate.getMonth() + 1).padStart(2, '0')}/${String(matchDate.getDate()).padStart(2, '0')} ${String(matchDate.getHours()).padStart(2, '0')}:${String(matchDate.getMinutes()).padStart(2, '0')}`;
    }

    function getRatingClass(rating) {
        const rVal = parseFloat(rating);
        if (rVal >= 9.0) return 'super';
        if (rVal >= 8.0) return 'high';
        if (rVal >= 7.0) return 'good';
        if (rVal >= 6.0) return 'mid';
        return 'low';
    }

    function updateClock() {
        const now = new Date();
        const clock = document.getElementById('clock');
        if (clock) clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function isTracked(mid) {
        return Boolean(window.AppState && window.AppState.monitoredMatches && window.AppState.monitoredMatches.has(Number(mid)));
    }

    // save only when the list really changed (cards of finished matches call removeTracked at every render)
    function removeTracked(mid) {
        const num = Number(mid);
        const t = (window.AppState?.monitoredMatches && window.AppState.monitoredMatches.has(num))
            ? window.AppState.monitoredMatches.delete(num)
            : false;
        if (t) saveTrackedMatches();
        return t;
    }

    function addTracked(mid) {
        const num = Number(mid);
        const t = (window.AppState?.monitoredMatches && !window.AppState.monitoredMatches.has(num))
            ? Boolean(window.AppState.monitoredMatches.add(num))
            : false;
        if (t) saveTrackedMatches();
        return t;
    }

    function toggleTrackVisual(mid, triggerEl = null) {
        const num = Number(mid);
        if (!num) return false;
        const currentlyTracked = isTracked(num);
        const cards = document.querySelectorAll(`#match-card-${num}, .match-card[data-id="${num}"], .bracket-match[data-id="${num}"], .kb-match[data-id="${num}"]`);

        if (currentlyTracked) {
            removeTracked(num);
            playSound('untrack');
            cards.forEach(card => {
                const ind = card.querySelector('.track-indicator');
                if (ind) ind.remove();
                card.classList.remove('track-pulse-anim');
            });
            const detailsBtn = document.getElementById('btn-track-toggle');
            if (detailsBtn && Number(detailsBtn.dataset.id) === num) {
                detailsBtn.classList.remove('track-active');
            }
            if (window.AppServices?.Helpers?.showToast) {
                window.AppServices.Helpers.showToast('Stopped tracking match', 'info');
            }
            return false;
        } else {
            addTracked(num);
            playSound('track');
            cards.forEach(card => {
                let dot = card.querySelector('.track-indicator');
                if (!dot) {
                    dot = document.createElement('div');
                    dot.className = 'track-indicator pop-in';
                    card.insertBefore(dot, card.firstChild);
                } else {
                    dot.classList.remove('pop-in');
                    void dot.offsetWidth;
                    dot.classList.add('pop-in');
                }
                card.classList.remove('track-pulse-anim');
                void card.offsetWidth;
                card.classList.add('track-pulse-anim');
                setTimeout(() => card.classList.remove('track-pulse-anim'), 850);
            });
            if (triggerEl && !cards.length) {
                triggerEl.classList.remove('track-pulse-anim');
                void triggerEl.offsetWidth;
                triggerEl.classList.add('track-pulse-anim');
                setTimeout(() => triggerEl.classList.remove('track-pulse-anim'), 850);
            }
            const detailsBtn = document.getElementById('btn-track-toggle');
            if (detailsBtn && Number(detailsBtn.dataset.id) === num) {
                detailsBtn.classList.add('track-active');
            }
            if (window.AppServices?.Helpers?.showToast) {
                window.AppServices.Helpers.showToast('🔴 Tracking match for live goal & FT alerts!', 'success');
            }
            return true;
        }
    }

    function isSoon(m) {
        const matchTime = new Date(m.fixture.date).getTime();
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;
        const willStartIn1Hour = (matchTime - now) <= ONE_HOUR && (matchTime - now) > 0;
        return willStartIn1Hour && m.fixture.status.short === 'NS';
    }

    function isRefreshNeeeded() {
        const now = Date.now() + 5 * 60 * 1000;
        const finishedStatus = new Set(['FT', 'AET', 'PEN']);
        const list = (window.AppState && Array.isArray(window.AppState.renderedMatches)) ? window.AppState.renderedMatches : [];
        const filteredMatches = list.filter(m => {
            const matchTime = new Date(m.fixture.date).getTime();
            return matchTime <= now && !finishedStatus.has(m.fixture.status.short);
        });
        return filteredMatches.length > 0;
    }

    return {
        IMG_PLACEHOLDER,
        preloadImage,
        ImageLoader,
        playSound,
        formTimeString,
        getRatingClass,
        updateClock,
        isTracked,
        removeTracked,
        addTracked,
        toggleTrackVisual,
        saveTrackedMatches,
        isRefreshNeeeded,
        fullDate,
        isSoon
    };
})();