const STORAGE_KEYS = {
    audioUnmuted: 'webshark-audio-unmuted',
    sharkboard: 'sharkboard-posts-v1',
    feedback: 'webshark-feedback-v1',
    sageosUsers: 'sageos-users-v1',
    sageosSession: 'sageos-session-v1',
    sageosInstances: 'sageos-instances-v1'
};

const LEGACY_STORAGE_KEYS = {
    sharkboard: 'sharkboard-posts'
};

const TAG_LABELS = {
    all: 'All',
    ai: 'AI',
    build: 'Build',
    business: 'Business',
    data: 'Data',
    research: 'Research',
    risk: 'Risk',
    sim: 'Simulation',
    wellness: 'Wellness'
};

const MAX_SHARKBOARD_POSTS = 50;
const MAX_FEEDBACK_ENTRIES = 75;
const prefersReducedMotionEarly = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const prefersReducedMotion = prefersReducedMotionEarly;
const prefersCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
const lowPowerMode = prefersCoarsePointer || ((navigator.hardwareConcurrency || 0) > 0 && navigator.hardwareConcurrency <= 4);
const statusRegion = document.getElementById('app-status');
const cards = Array.from(document.querySelectorAll('.card'));

let _lastMouseX = window.innerWidth / 2;
let _lastMouseY = window.innerHeight / 2;
let statusAnnouncementFrame = 0;

function announceStatus(message) {
    if (!statusRegion || !message) return;
    cancelAnimationFrame(statusAnnouncementFrame);
    statusRegion.textContent = '';
    statusAnnouncementFrame = requestAnimationFrame(() => {
        statusRegion.textContent = message;
    });
}

function safeReadStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeWriteStorage(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function safeRemoveStorage(key) {
    try {
        localStorage.removeItem(key);
    } catch {
        // Intentionally no-op. Storage is an enhancement, not a hard dependency.
    }
}

function safeReadJSON(key) {
    const raw = safeReadStorage(key);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function normalizeText(text) {
    return (text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getFocusableElements(container) {
    if (!container) return [];

    return Array.from(
        container.querySelectorAll(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    ).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}

function createFocusTrap(container, { initialFocus, onEscape } = {}) {
    let active = false;

    function handleKeydown(event) {
        if (!active) return;

        if (event.key === 'Escape') {
            if (typeof onEscape === 'function') {
                event.preventDefault();
                onEscape();
            }
            return;
        }

        if (event.key !== 'Tab') return;

        const focusable = getFocusableElements(container);
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
            return;
        }

        if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    return {
        activate() {
            active = true;
            document.addEventListener('keydown', handleKeydown);
            requestAnimationFrame(() => {
                const target = initialFocus?.() || getFocusableElements(container)[0] || container;
                if (target && typeof target.focus === 'function') {
                    target.focus();
                }
            });
        },
        deactivate() {
            active = false;
            document.removeEventListener('keydown', handleKeydown);
        }
    };
}

function runWhenIdle(task, timeout = 900) {
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => task(), { timeout });
        return;
    }
    window.setTimeout(task, Math.min(timeout, 350));
}

// 0. Shared pointer state
const sharkCursor = document.getElementById('custom-shark-cursor');
const pointerState = {
    x: _lastMouseX,
    y: _lastMouseY,
    dirty: false
};
let pointerFrame = 0;
let glowActivated = false;
let isSharkMode = false;

function flushPointerEffects() {
    pointerFrame = 0;
    pointerState.dirty = false;

    if (isSharkMode && sharkCursor) {
        sharkCursor.style.transform = `translate3d(${pointerState.x}px, ${pointerState.y}px, 0) translate(-50%, -50%)`;
    }

    if (!prefersReducedMotion) {
        if (!glowActivated) {
            document.body.classList.add('glow-active');
            glowActivated = true;
        }

        document.documentElement.style.setProperty('--glow-x', `${pointerState.x}px`);
        document.documentElement.style.setProperty('--glow-y', `${pointerState.y}px`);
        document.documentElement.style.setProperty('--current-shift-x', `${(pointerState.x / window.innerWidth - 0.5) * 22}px`);
        document.documentElement.style.setProperty('--current-shift-y', `${(pointerState.y / window.innerHeight - 0.5) * 18}px`);
    }
}

window.addEventListener('mousemove', (event) => {
    _lastMouseX = event.clientX;
    _lastMouseY = event.clientY;
    pointerState.x = event.clientX;
    pointerState.y = event.clientY;
    pointerState.dirty = true;

    if (!pointerFrame) {
        pointerFrame = requestAnimationFrame(flushPointerEffects);
    }
}, { passive: true });

// 1. Shared Visitor Counter
(function initVisitorCounter() {
    const count = document.getElementById('visitor-count');
    if (!count) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    fetch('https://api.counterapi.dev/v1/webshark-ai/homepage/up', {
        signal: controller.signal
    })
        .then((response) => {
            if (!response.ok) throw new Error('Unable to load visitor count');
            return response.json();
        })
        .then(({ count: total }) => {
            if (!Number.isFinite(total)) throw new Error('Invalid visitor count');
            count.textContent = total.toLocaleString();
        })
        .catch(() => {
            count.textContent = 'Unavailable';
        })
        .finally(() => window.clearTimeout(timeout));
})();

// 2. Dynamic cursor light tracking + subtle 3D tilt
function spawnSonarPing(card) {
    if (prefersReducedMotionEarly) return;
    const ping = document.createElement('span');
    ping.className = 'sonar-ping';
    ping.addEventListener('animationend', () => ping.remove(), { once: true });
    card.appendChild(ping);
}

cards.forEach((card, index) => {
    card.style.setProperty('--card-phase', `${(index * 0.45).toFixed(2)}s`);
    card.style.setProperty('--card-icon-tilt', `${index % 2 === 0 ? 3 : -3}deg`);

    if (!prefersCoarsePointer) {
        card.addEventListener('pointermove', (event) => {
            const rect = card.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);

            if (!prefersReducedMotionEarly && !lowPowerMode) {
                const centerX = x - rect.width / 2;
                const centerY = y - rect.height / 2;
                const rotateY = (centerX / (rect.width / 2)) * 6;
                const rotateX = -(centerY / (rect.height / 2)) * 6;
                card.style.transform = `translateY(-6px) scale(1.01) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            }
        }, { passive: true });
    }

    card.addEventListener('mouseleave', () => {
        card.style.transform = '';
    });

    card.addEventListener('mouseenter', () => {
        spawnSonarPing(card);
    });

    card.addEventListener('focusin', () => {
        spawnSonarPing(card);
    });
});

// 3. Performance-optimized scroll effects
(function initScrollEffects() {
    const root = document.documentElement;
    const backToTop = document.getElementById('back-to-top');
    let frame = 0;

    function updateScrollEffects() {
        frame = 0;
        const scrollTop = window.pageYOffset;
        const docHeight = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        const depth = scrollTop * 0.12;

        document.body.style.setProperty('--scroll-y', `${depth}px`);
        root.style.setProperty('--scroll-progress', `${progress}%`);

        if (backToTop) {
            backToTop.classList.toggle('visible', scrollTop > window.innerHeight * 0.6);
        }
    }

    function requestUpdate() {
        if (!frame) {
            frame = requestAnimationFrame(updateScrollEffects);
        }
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
    requestUpdate();
})();

// 4. Smooth intersection observer for content entry
const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            revealObserver.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
});

revealElements.forEach((element, index) => {
    element.style.transitionDelay = `${index * 120}ms`;
    revealObserver.observe(element);
});

// 5. Interactive shark badge & custom cursor state engines
(function initSharkMode() {
    const badge = document.getElementById('visitor-badge');
    const badgeText = document.getElementById('visitor-badge-text');
    if (!badge || !badgeText) return;

    function syncBadgeState() {
        document.body.classList.toggle('shark-cursor-mode', isSharkMode);
        badge.classList.toggle('shark-active', isSharkMode);
        badge.setAttribute('aria-pressed', String(isSharkMode));
        badge.setAttribute('aria-label', isSharkMode ? 'Disable shark cursor mode' : 'Enable shark cursor mode');
        badgeText.textContent = isSharkMode
            ? 'Swimming with the sharks is easy now.'
            : 'Work doesn\'t have to bite. Use WebShark.ai now.';

        if (!isSharkMode && sharkCursor) {
            sharkCursor.textContent = '🦈';
        }
    }

    badge.addEventListener('click', (event) => {
        event.stopPropagation();
        isSharkMode = !isSharkMode;
        syncBadgeState();
        announceStatus(isSharkMode ? 'Shark cursor mode enabled.' : 'Shark cursor mode disabled.');
    });

    window.addEventListener('mousedown', () => {
        if (isSharkMode && sharkCursor) {
            sharkCursor.textContent = '😬';
        }
    });

    window.addEventListener('mouseup', () => {
        if (isSharkMode && sharkCursor) {
            sharkCursor.textContent = '🦈';
        }
    });

    syncBadgeState();
})();

// 6. Ambient rising bubble field
runWhenIdle(() => {
    (function initBubbleField() {
    const canvas = document.getElementById('bubble-field');
    if (!canvas || prefersReducedMotion) return;

    const ctx = canvas.getContext('2d');
    let width;
    let height;
    let bubbles = [];
    let motes = [];
    let rafId = 0;
    let isVisible = true;
    const trailMax = lowPowerMode ? 6 : 12;
    let trail = [];
    let lastTrailSpawn = 0;

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    function createBubbles() {
        const bubbleDivisor = lowPowerMode ? 65000 : 45000;
        const moteDivisor = lowPowerMode ? 120000 : 90000;
        const bubbleCount = Math.min(lowPowerMode ? 18 : 36, Math.floor((width * height) / bubbleDivisor));
        const moteCount = Math.min(lowPowerMode ? 18 : 34, Math.floor((width * height) / moteDivisor));
        bubbles = Array.from({ length: bubbleCount }, () => spawnBubble(true));
        motes = Array.from({ length: moteCount }, () => spawnMote(true));
    }

    function spawnBubble(randomY = false) {
        const radius = 2 + Math.random() * 6;
        return {
            x: Math.random() * width,
            y: randomY ? Math.random() * height : height + radius,
            radius,
            speed: 0.3 + Math.random() * 0.9,
            drift: (Math.random() - 0.5) * 0.4,
            wobble: Math.random() * Math.PI * 2,
            opacity: 0.08 + Math.random() * 0.18
        };
    }

    function spawnMote(randomY = false) {
        return {
            x: Math.random() * width,
            y: randomY ? Math.random() * height : height + Math.random() * 120,
            radius: 1 + Math.random() * 2.8,
            speed: 0.25 + Math.random() * 0.45,
            drift: (Math.random() - 0.5) * 0.45,
            wobble: Math.random() * Math.PI * 2,
            opacity: 0.04 + Math.random() * 0.08
        };
    }

    function spawnTrailParticle(x, y) {
        return {
            x,
            y,
            radius: 1 + Math.random() * 2,
            speed: 0.8 + Math.random() * 1.2,
            drift: (Math.random() - 0.5) * 0.3,
            wobble: Math.random() * Math.PI * 2,
            opacity: 0.10 + Math.random() * 0.12,
            age: 0
        };
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        const sharkMode = document.body.classList.contains('shark-cursor-mode');

        if (sharkMode) {
            const now = performance.now();
            if (now - lastTrailSpawn > (lowPowerMode ? 60 : 30)) {
                trail.push(spawnTrailParticle(_lastMouseX, _lastMouseY));
                if (trail.length > trailMax) trail.shift();
                lastTrailSpawn = now;
            }
        } else if (trail.length) {
            trail = [];
        }

        bubbles.forEach((bubble) => {
            bubble.wobble += 0.01;
            bubble.y -= bubble.speed;
            bubble.x += bubble.drift + Math.sin(bubble.wobble) * 0.3;

            if (bubble.y + bubble.radius < 0) {
                Object.assign(bubble, spawnBubble(false));
            }

            ctx.beginPath();
            ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(56, 189, 248, ${bubble.opacity})`;
            ctx.fillStyle = `rgba(56, 189, 248, ${bubble.opacity * 0.35})`;
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();
        });

        motes.forEach((mote) => {
            mote.wobble += 0.015;
            mote.y -= mote.speed;
            mote.x += mote.drift + Math.sin(mote.wobble) * 0.18;

            if (mote.y + mote.radius < 0) {
                Object.assign(mote, spawnMote(false));
            }

            const alpha = mote.opacity * (0.65 + Math.sin(mote.wobble) * 0.35);
            ctx.beginPath();
            ctx.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(125, 211, 252, ${alpha})`;
            ctx.shadowBlur = 16;
            ctx.shadowColor = `rgba(125, 211, 252, ${alpha})`;
            ctx.fill();
        });

        ctx.shadowBlur = 0;

        for (let index = trail.length - 1; index >= 0; index -= 1) {
            const particle = trail[index];
            particle.wobble += 0.015;
            particle.y -= particle.speed;
            particle.x += particle.drift + Math.sin(particle.wobble) * 0.25;
            particle.age += 1;

            const fade = Math.max(0, 1 - particle.age / 60);
            const alpha = particle.opacity * fade;

            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
            ctx.fillStyle = `rgba(56, 189, 248, ${alpha * 0.5})`;
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();

            if (particle.y + particle.radius < 0 || fade <= 0) {
                trail.splice(index, 1);
            }
        }

        if (isVisible) {
            rafId = requestAnimationFrame(draw);
        }
    }

    document.addEventListener('visibilitychange', () => {
        isVisible = document.visibilityState === 'visible';
        if (isVisible) {
            rafId = requestAnimationFrame(draw);
        } else {
            cancelAnimationFrame(rafId);
        }
    });

    window.addEventListener('resize', () => {
        resize();
        createBubbles();
    }, { passive: true });

    resize();
    createBubbles();
    draw();
    })();
}, 1400);

// 7. Shimmer hover effect
runWhenIdle(() => {
    document.querySelectorAll('.shimmer-word').forEach((shimmerElement) => {
        shimmerElement.addEventListener('mouseenter', () => {
            shimmerElement.style.animationDuration = '1s';
            shimmerElement.style.filter = 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.6))';
        });

        shimmerElement.addEventListener('mouseleave', () => {
            shimmerElement.style.animationDuration = '3.5s';
            shimmerElement.style.filter = 'none';
        });
    });
}, 1200);

// 8. Scroll cue
(function initScrollCue() {
    const cue = document.getElementById('scroll-cue');
    const suite = document.getElementById('suite');
    const hero = document.querySelector('.hero');
    if (!cue || !suite || !hero) return;

    cue.addEventListener('click', () => {
        suite.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const cueObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            cue.style.opacity = entry.isIntersecting ? '1' : '0';
            cue.style.pointerEvents = entry.isIntersecting ? 'auto' : 'none';
        });
    }, { threshold: 0.3 });

    cueObserver.observe(hero);
})();

// 9. Back-to-surface button
(function initBackToTop() {
    const button = document.getElementById('back-to-top');
    if (!button) return;

    button.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();

// 10. Visible suite metadata
(function initCardMetadata() {
    cards.forEach((card) => {
        const tags = (card.dataset.tags || '')
            .split(/\s+/)
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean);

        if (tags.length === 0) return;

        const meta = document.createElement('div');
        meta.className = 'card-meta';

        tags.forEach((tag) => {
            const pill = document.createElement('span');
            pill.className = 'card-pill';
            pill.textContent = TAG_LABELS[tag] || tag;
            meta.appendChild(pill);
        });

        const externalPill = document.createElement('span');
        externalPill.className = 'card-pill card-pill-external';
        externalPill.textContent = 'External app';
        meta.appendChild(externalPill);

        const title = card.querySelector('h3');
        if (title) {
            title.insertAdjacentElement('beforebegin', meta);
        } else {
            card.appendChild(meta);
        }
    });
})();

// 11. Live search/filter for the suite grid (with URL state sync)
(function initSuiteSearch() {
    const input = document.getElementById('suite-search');
    const emptyState = document.getElementById('suite-empty-state');
    const chipsContainer = document.getElementById('suite-chips');
    const results = document.getElementById('suite-results');
    const activeFilterSummary = document.getElementById('suite-active-filter');
    const clearButton = document.getElementById('suite-clear');
    const suiteCards = Array.from(document.querySelectorAll('.suite-grid .card'));
    if (!input || !chipsContainer || !results || !activeFilterSummary || !clearButton) return;

    const chips = Array.from(chipsContainer.querySelectorAll('.chip'));
    const validTags = new Set(chips.map((chip) => chip.dataset.tag).filter(Boolean));
    let activeTag = 'all';
    let suppressUrlWrite = false;

    const indexedCards = suiteCards.map((card) => {
        const rawTags = (card.dataset.tags || '')
            .split(/\s+/)
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean);

        return {
            card,
            rawTags,
            normalizedName: normalizeText(card.querySelector('h3')?.textContent || ''),
            normalizedDescription: normalizeText(card.querySelector('p')?.textContent || ''),
            normalizedTags: normalizeText(rawTags.join(' '))
        };
    });

    function buildURL(query, tag) {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        if (tag && tag !== 'all') params.set('tag', tag);
        const queryString = params.toString();
        return queryString ? `${location.pathname}?${queryString}` : location.pathname;
    }

    function readURLState() {
        const params = new URLSearchParams(location.search);
        return {
            query: params.get('q') || '',
            tag: params.get('tag') || 'all'
        };
    }

    function normalizeTag(tag) {
        return validTags.has(tag) ? tag : 'all';
    }

    function syncChipsToTag(tag) {
        chips.forEach((chip) => {
            const isActive = chip.dataset.tag === tag;
            chip.classList.toggle('is-active', isActive);
            chip.setAttribute('aria-pressed', String(isActive));
        });
    }

    function writeURL() {
        const query = input.value.trim();
        const url = buildURL(query, activeTag);
        if (url !== `${location.pathname}${location.search}`) {
            history.replaceState(null, '', url);
        }
    }

    function updateSummaries(visibleCount, totalCount) {
        const query = input.value.trim();
        const tagLabel = TAG_LABELS[activeTag] || activeTag;

        results.textContent = `Showing ${visibleCount} of ${totalCount} tools`;

        if (query && activeTag !== 'all') {
            activeFilterSummary.textContent = `Active filters: "${query}" in ${tagLabel}`;
        } else if (query) {
            activeFilterSummary.textContent = `Active search: "${query}"`;
        } else if (activeTag !== 'all') {
            activeFilterSummary.textContent = `Active category: ${tagLabel}`;
        } else {
            activeFilterSummary.textContent = 'Browsing the full collection';
        }

        clearButton.hidden = !(query || activeTag !== 'all');
    }

    function applyFilters({ announce = false } = {}) {
        const normalizedQuery = normalizeText(input.value);
        let visibleCount = 0;

        indexedCards.forEach((entry) => {
            const matchesQuery = !normalizedQuery
                || entry.normalizedName.includes(normalizedQuery)
                || entry.normalizedDescription.includes(normalizedQuery)
                || entry.normalizedTags.includes(normalizedQuery);
            const matchesTag = activeTag === 'all' || entry.rawTags.includes(activeTag);
            const visible = matchesQuery && matchesTag;

            entry.card.classList.toggle('filtered-out', !visible);
            entry.card.setAttribute('aria-hidden', String(!visible));

            if (visible) {
                visibleCount += 1;
            }
        });

        if (emptyState) {
            emptyState.hidden = visibleCount !== 0;
        }

        updateSummaries(visibleCount, indexedCards.length);

        if (announce) {
            announceStatus(`Suite filters updated. ${visibleCount} tools available.`);
        }
    }

    function resetFilters({ announce = false } = {}) {
        input.value = '';
        activeTag = 'all';
        syncChipsToTag(activeTag);
        applyFilters({ announce });
        if (!suppressUrlWrite) writeURL();
    }

    const initial = readURLState();
    if (initial.query) input.value = initial.query;
    activeTag = normalizeTag(initial.tag);
    syncChipsToTag(activeTag);
    suppressUrlWrite = true;
    applyFilters();
    suppressUrlWrite = false;

    input.addEventListener('input', () => {
        applyFilters();
        if (!suppressUrlWrite) writeURL();
    });

    chipsContainer.addEventListener('click', (event) => {
        const chip = event.target.closest('.chip');
        if (!chip || !chipsContainer.contains(chip)) return;

        activeTag = normalizeTag(chip.dataset.tag || 'all');
        syncChipsToTag(activeTag);
        applyFilters({ announce: true });
        if (!suppressUrlWrite) writeURL();
    });

    clearButton.addEventListener('click', () => {
        resetFilters({ announce: true });
        input.focus();
    });

    window.addEventListener('popstate', () => {
        const state = readURLState();
        input.value = state.query;
        activeTag = normalizeTag(state.tag);
        syncChipsToTag(activeTag);
        applyFilters();
    });
})();

// 12. Optional ambient background audio
(function initAmbientAudio() {
    const toggle = document.getElementById('audio-toggle');
    const icon = toggle ? toggle.querySelector('.audio-icon') : null;
    if (!toggle) return;

    let player = null;
    let playerReady = false;
    let apiPromise = null;
    let playerInitPromise = null;
    let wantsUnmuted = safeReadStorage(STORAGE_KEYS.audioUnmuted) !== 'false';
    let autoplayEngaged = false;

    function setToggleState(unmuted, loading = false) {
        toggle.setAttribute('aria-pressed', String(unmuted));

        if (loading) {
            toggle.title = 'Ambient audio: loading';
            if (icon) icon.textContent = '⏳';
            return;
        }

        toggle.title = unmuted ? 'Ambient audio: playing (click to mute)' : 'Ambient audio: muted (click to play)';
        if (icon) icon.textContent = unmuted ? '🔊' : '🔇';
    }

    function stopListeningForEngagement() {
        ['click', 'keydown', 'touchstart', 'scroll'].forEach((eventName) => {
            document.removeEventListener(eventName, handlePotentialEngagement);
        });
    }

    function ensureYouTubeAPI() {
        if (window.YT && typeof window.YT.Player === 'function') {
            return Promise.resolve(window.YT);
        }

        if (apiPromise) return apiPromise;

        apiPromise = new Promise((resolve, reject) => {
            window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
                resolve(window.YT);
            };

            if (document.querySelector('script[data-yt-api="true"]')) {
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            script.async = true;
            script.dataset.ytApi = 'true';
            script.onerror = () => reject(new Error('Unable to load YouTube IFrame API'));
            document.head.appendChild(script);
        });

        return apiPromise;
    }

    function ensurePlayer() {
        if (playerReady && player) {
            return Promise.resolve(player);
        }

        if (playerInitPromise) return playerInitPromise;

        setToggleState(wantsUnmuted, true);

        playerInitPromise = ensureYouTubeAPI()
            .then(() => new Promise((resolve) => {
                player = new YT.Player('yt-audio-player', {
                    videoId: 'vIDr8ZnCLQw',
                    playerVars: {
                        autoplay: 1,
                        mute: 1,
                        loop: 1,
                        playlist: 'vIDr8ZnCLQw',
                        controls: 0,
                        disablekb: 1,
                        fs: 0,
                        modestbranding: 1
                    },
                    events: {
                        onReady: () => {
                            playerReady = true;
                            player.playVideo();
                            resolve(player);
                        }
                    }
                });
            }))
            .catch((error) => {
                apiPromise = null;
                playerInitPromise = null;
                playerReady = false;
                player = null;
                wantsUnmuted = false;
                safeWriteStorage(STORAGE_KEYS.audioUnmuted, 'false');
                setToggleState(false, false);
                announceStatus('Ambient audio is unavailable right now.');
                throw error;
            });

        return playerInitPromise;
    }

    function syncAudioState() {
        if (!playerReady || !player) {
            setToggleState(wantsUnmuted, false);
            return;
        }

        if (wantsUnmuted) {
            player.unMute();
            player.playVideo();
            autoplayEngaged = true;
        } else {
            player.mute();
            if (typeof player.pauseVideo === 'function') {
                player.pauseVideo();
            }
            autoplayEngaged = false;
        }

        setToggleState(wantsUnmuted, false);
    }

    function handlePotentialEngagement() {
        if (autoplayEngaged || !wantsUnmuted) return;

        ensurePlayer()
            .then(() => {
                if (!playerReady || !player || !wantsUnmuted) return;
                player.unMute();
                player.playVideo();
                autoplayEngaged = true;
                setToggleState(true, false);
                stopListeningForEngagement();
            })
            .catch(() => {
                stopListeningForEngagement();
            });
    }

    if (wantsUnmuted) {
        ['click', 'keydown', 'touchstart', 'scroll'].forEach((eventName) => {
            document.addEventListener(eventName, handlePotentialEngagement, { passive: true });
        });
    }

    toggle.addEventListener('click', () => {
        wantsUnmuted = !wantsUnmuted;
        safeWriteStorage(STORAGE_KEYS.audioUnmuted, String(wantsUnmuted));

        if (wantsUnmuted) {
            ensurePlayer()
                .then(() => {
                    syncAudioState();
                    stopListeningForEngagement();
                    announceStatus('Ambient audio on.');
                })
                .catch(() => {
                    // Error path already announced in ensurePlayer.
                });
            return;
        }

        stopListeningForEngagement();
        syncAudioState();
        announceStatus('Ambient audio muted.');
    });

    setToggleState(wantsUnmuted, false);
})();

// 13. Shark bite click feedback on cards
(function initCardBiteFeedback() {
    if (prefersReducedMotionEarly) return;

    cards.forEach((card) => {
        card.addEventListener('click', (event) => {
            const href = card.getAttribute('href');
            if (href) {
                event.preventDefault();
            }

            card.classList.add('bite-active');
            window.setTimeout(() => card.classList.remove('bite-active'), 400);

            const bite = document.createElement('span');
            bite.className = 'bite-mark';
            bite.textContent = '🦈';
            const rect = card.getBoundingClientRect();
            const clientX = Number.isFinite(event.clientX) && event.clientX !== 0 ? event.clientX : rect.left + rect.width / 2;
            const clientY = Number.isFinite(event.clientY) && event.clientY !== 0 ? event.clientY : rect.top + rect.height / 2;
            bite.style.left = `${clientX - rect.left - 12}px`;
            bite.style.top = `${clientY - rect.top - 12}px`;
            card.appendChild(bite);
            bite.addEventListener('animationend', () => bite.remove(), { once: true });

            if (href) {
                setTimeout(() => {
                    window.open(href, '_self');
                }, 260);
            }
        });
    });
})();

// 14. Shark swarm easter egg
(function initSharkSwarmEasterEgg() {
    const badge = document.getElementById('visitor-badge');
    const swarmContainer = document.getElementById('shark-swarm');
    if (!badge || !swarmContainer || prefersReducedMotionEarly) return;

    let clickTimes = [];

    badge.addEventListener('click', () => {
        const now = Date.now();
        clickTimes = clickTimes.filter((timestamp) => now - timestamp < 900);
        clickTimes.push(now);

        if (clickTimes.length >= 3) {
            clickTimes = [];
            announceStatus('Shark swarm released.');
            spawnSharkSwarm();
        }
    });

    function spawnSharkSwarm() {
        const count = 6;

        for (let index = 0; index < count; index += 1) {
            const shark = document.createElement('span');
            shark.className = 'swarm-shark';
            shark.textContent = '🦈';
            shark.style.top = `${10 + Math.random() * 70}%`;
            shark.style.left = '-80px';
            const duration = 2.5 + Math.random() * 1.5;
            const delay = index * 120;
            shark.style.animationDuration = `${duration}s`;
            shark.style.animationDelay = `${delay}ms`;
            swarmContainer.appendChild(shark);
            setTimeout(() => shark.remove(), (duration * 1000) + delay + 200);
        }
    }
})();

// 15. SharkBoard panel management
(function initSharkBoard() {
    const toggle = document.getElementById('sharkboard-toggle');
    const panel = document.getElementById('sharkboard-panel');
    const closeButton = document.getElementById('sharkboard-close');
    const submitButton = document.getElementById('sharkboard-submit');
    const textarea = document.getElementById('sharkboard-input');
    const charCount = document.getElementById('char-count');
    const postsContainer = document.getElementById('sharkboard-posts');
    if (!toggle || !panel || !closeButton || !submitButton || !textarea || !charCount || !postsContainer) return;

    let lastFocusedElement = null;
    let posts = loadPosts();
    const trap = createFocusTrap(panel, {
        initialFocus: () => textarea,
        onEscape: () => closePanel()
    });

    function normalizePost(rawPost, index) {
        if (!rawPost || typeof rawPost !== 'object') return null;

        const content = typeof rawPost.content === 'string'
            ? rawPost.content.trim().slice(0, 500)
            : '';

        if (!content) return null;

        return {
            id: Number.isFinite(Number(rawPost.id)) ? Number(rawPost.id) : Date.now() + index,
            content,
            author: typeof rawPost.author === 'string' && rawPost.author.trim()
                ? rawPost.author.trim().slice(0, 40)
                : 'Anonymous Shark',
            timestamp: typeof rawPost.timestamp === 'string' && rawPost.timestamp.trim()
                ? rawPost.timestamp.trim()
                : new Date().toLocaleString(),
            likes: Number.isFinite(Number(rawPost.likes)) && Number(rawPost.likes) >= 0
                ? Math.floor(Number(rawPost.likes))
                : 0
        };
    }

    function loadPosts() {
        const current = safeReadJSON(STORAGE_KEYS.sharkboard);
        const legacy = safeReadJSON(LEGACY_STORAGE_KEYS.sharkboard);
        const source = Array.isArray(current)
            ? current
            : Array.isArray(current?.posts)
                ? current.posts
                : Array.isArray(legacy)
                    ? legacy
                    : [];

        const normalized = source
            .map((post, index) => normalizePost(post, index))
            .filter(Boolean)
            .slice(0, MAX_SHARKBOARD_POSTS);

        persistPosts(normalized);
        return normalized;
    }

    function persistPosts(nextPosts) {
        const payload = {
            version: 1,
            posts: nextPosts.slice(0, MAX_SHARKBOARD_POSTS)
        };

        safeWriteStorage(STORAGE_KEYS.sharkboard, JSON.stringify(payload));
        safeRemoveStorage(LEGACY_STORAGE_KEYS.sharkboard);
    }

    function updateComposerState() {
        const length = textarea.value.length;
        const hasContent = textarea.value.trim().length > 0;
        charCount.textContent = String(length);
        submitButton.disabled = !hasContent;
    }

    function renderPosts() {
        if (posts.length === 0) {
            postsContainer.innerHTML = '<p class="sharkboard-empty">No posts yet. Be the first to share! 🎨</p>';
            return;
        }

        postsContainer.innerHTML = posts.map((post) => `
            <article class="sharkboard-post" data-post-id="${post.id}">
                <div class="sharkboard-post-meta">
                    <span class="sharkboard-post-author">${escapeHtml(post.author)}</span>
                    <span>${escapeHtml(post.timestamp)}</span>
                </div>
                <div class="sharkboard-post-content">${escapeHtml(post.content)}</div>
                <div class="sharkboard-post-actions">
                    <button type="button" class="sharkboard-post-action" data-post-id="${post.id}" data-action="like" aria-label="Like post">
                        ❤️ ${post.likes}
                    </button>
                    <button type="button" class="sharkboard-post-action" data-post-id="${post.id}" data-action="edit">
                        ✏️ Edit
                    </button>
                    <button type="button" class="sharkboard-post-action" data-post-id="${post.id}" data-action="delete">
                        🗑️ Delete
                    </button>
                </div>
            </article>
        `).join('');
    }

    function openPanel() {
        lastFocusedElement = document.activeElement;
        panel.hidden = false;
        document.body.classList.add('panel-open');
        toggle.setAttribute('aria-expanded', 'true');
        renderPosts();
        trap.activate();
        announceStatus('SharkBoard opened.');
    }

    function closePanel({ returnFocus = true } = {}) {
        if (panel.hidden) return;

        panel.hidden = true;
        document.body.classList.remove('panel-open');
        toggle.setAttribute('aria-expanded', 'false');
        trap.deactivate();

        if (returnFocus) {
            const focusTarget = lastFocusedElement && typeof lastFocusedElement.focus === 'function'
                ? lastFocusedElement
                : toggle;
            focusTarget.focus();
        }

        announceStatus('SharkBoard closed.');
    }

    function saveAndRender() {
        posts = posts.slice(0, MAX_SHARKBOARD_POSTS);
        persistPosts(posts);
        renderPosts();
    }

    textarea.addEventListener('input', updateComposerState);

    toggle.addEventListener('click', () => {
        if (panel.hidden) {
            openPanel();
            return;
        }

        closePanel({ returnFocus: false });
    });

    closeButton.addEventListener('click', () => {
        closePanel();
    });

    document.addEventListener('mousedown', (event) => {
        if (panel.hidden) return;
        if (panel.contains(event.target) || toggle.contains(event.target)) return;
        closePanel({ returnFocus: false });
    });

    submitButton.addEventListener('click', () => {
        const content = textarea.value.trim();
        if (!content) {
            textarea.focus();
            announceStatus('Write something before posting.');
            return;
        }

        const post = normalizePost({
            id: Date.now(),
            content,
            author: 'Anonymous Shark',
            timestamp: new Date().toLocaleString(),
            likes: 0
        }, 0);

        posts.unshift(post);
        posts = posts.slice(0, MAX_SHARKBOARD_POSTS);
        textarea.value = '';
        updateComposerState();
        saveAndRender();
        textarea.focus();
        announceStatus('Post saved to this browser.');
    });

    textarea.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            submitButton.click();
        }
    });

    postsContainer.addEventListener('click', (event) => {
        const actionButton = event.target.closest('.sharkboard-post-action');
        if (!actionButton) return;

        const postId = Number(actionButton.dataset.postId);
        const action = actionButton.dataset.action;
        const postIndex = posts.findIndex((post) => post.id === postId);
        if (postIndex === -1) return;

        if (action === 'like') {
            posts[postIndex].likes += 1;
            saveAndRender();
            announceStatus('Post liked.');
            return;
        }

        if (action === 'edit') {
            const newContent = window.prompt('Edit your post:', posts[postIndex].content);
            if (newContent === null) return;

            const trimmed = newContent.trim();
            if (!trimmed) {
                announceStatus('Empty edits were not saved.');
                return;
            }

            posts[postIndex].content = trimmed.slice(0, 500);
            saveAndRender();
            announceStatus('Post updated.');
            return;
        }

        if (action === 'delete') {
            const confirmed = window.confirm('Are you sure you want to delete this post?');
            if (!confirmed) return;

            posts.splice(postIndex, 1);
            saveAndRender();
            announceStatus('Post deleted.');
        }
    });

    toggle.setAttribute('aria-expanded', 'false');
    updateComposerState();
    renderPosts();
})();

// 16. Experience feedback guestbook
(function initExperienceGuestbook() {
    const form = document.getElementById('feedback-form');
    const nameInput = document.getElementById('feedback-name');
    const ratingSelect = document.getElementById('feedback-rating');
    const appsContainer = document.getElementById('feedback-apps');
    const messageInput = document.getElementById('feedback-message');
    const charCount = document.getElementById('feedback-char-count');
    const submitButton = document.getElementById('feedback-submit');
    const entriesContainer = document.getElementById('feedback-entries');
    const summary = document.getElementById('feedback-summary');
    if (!form || !nameInput || !ratingSelect || !appsContainer || !messageInput || !charCount || !submitButton || !entriesContainer || !summary) return;

    const appNames = cards
        .map((card) => card.querySelector('h3')?.textContent?.trim() || '')
        .filter(Boolean);

    let entries = loadEntries();

    function slugify(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function buildAppOptions() {
        appsContainer.innerHTML = appNames.map((appName) => {
            const id = `feedback-app-${slugify(appName)}`;
            return `
                <div class="feedback-app-option">
                    <input type="checkbox" id="${id}" value="${escapeHtml(appName)}">
                    <label for="${id}">${escapeHtml(appName)}</label>
                </div>
            `;
        }).join('');
    }

    function getSelectedApps() {
        return Array.from(appsContainer.querySelectorAll('input:checked')).map((input) => input.value);
    }

    function renderStars(rating) {
        const safeRating = Math.max(1, Math.min(5, Number(rating) || 5));
        return `${'★'.repeat(safeRating)}${'☆'.repeat(5 - safeRating)}`;
    }

    function normalizeEntry(rawEntry, index) {
        if (!rawEntry || typeof rawEntry !== 'object') return null;

        const message = typeof rawEntry.message === 'string'
            ? rawEntry.message.trim().slice(0, 600)
            : '';

        if (!message) return null;

        const apps = Array.isArray(rawEntry.apps)
            ? rawEntry.apps
                .map((app) => typeof app === 'string' ? app.trim().slice(0, 80) : '')
                .filter(Boolean)
                .slice(0, 6)
            : [];

        if (apps.length === 0) return null;

        const upvotes = Number.isFinite(Number(rawEntry.upvotes)) ? Math.max(0, Math.floor(Number(rawEntry.upvotes))) : 0;
        const downvotes = Number.isFinite(Number(rawEntry.downvotes)) ? Math.max(0, Math.floor(Number(rawEntry.downvotes))) : 0;
        const userVote = [-1, 0, 1].includes(Number(rawEntry.userVote)) ? Number(rawEntry.userVote) : 0;

        return {
            id: Number.isFinite(Number(rawEntry.id)) ? Number(rawEntry.id) : Date.now() + index,
            name: typeof rawEntry.name === 'string' && rawEntry.name.trim()
                ? rawEntry.name.trim().slice(0, 40)
                : 'Anonymous Visitor',
            rating: Math.max(1, Math.min(5, Number(rawEntry.rating) || 5)),
            apps,
            message,
            timestamp: typeof rawEntry.timestamp === 'string' && rawEntry.timestamp.trim()
                ? rawEntry.timestamp.trim()
                : new Date().toLocaleString(),
            upvotes,
            downvotes,
            userVote
        };
    }

    function persistEntries(nextEntries) {
        safeWriteStorage(STORAGE_KEYS.feedback, JSON.stringify({
            version: 1,
            entries: nextEntries.slice(0, MAX_FEEDBACK_ENTRIES)
        }));
    }

    function loadEntries() {
        const stored = safeReadJSON(STORAGE_KEYS.feedback);
        const source = Array.isArray(stored)
            ? stored
            : Array.isArray(stored?.entries)
                ? stored.entries
                : [];

        const normalized = source
            .map((entry, index) => normalizeEntry(entry, index))
            .filter(Boolean)
            .slice(0, MAX_FEEDBACK_ENTRIES);

        persistEntries(normalized);
        return normalized;
    }

    function updateFormState() {
        charCount.textContent = String(messageInput.value.length);
        const hasMessage = messageInput.value.trim().length > 0;
        const hasApps = getSelectedApps().length > 0;
        submitButton.disabled = !(hasMessage && hasApps);
    }

    function resetForm() {
        form.reset();
        ratingSelect.value = '5';
        charCount.textContent = '0';
        updateFormState();
    }

    function renderEntries() {
        summary.textContent = `${entries.length} signed ${entries.length === 1 ? 'entry' : 'entries'}`;

        if (entries.length === 0) {
            entriesContainer.innerHTML = '<p class="feedback-empty">No signed feedback yet. Be the first visitor to log your experience.</p>';
            return;
        }

        entriesContainer.innerHTML = entries.map((entry) => `
            <article class="feedback-entry" data-entry-id="${entry.id}">
                <div class="feedback-entry-header">
                    <div class="feedback-entry-author">
                        <strong>${escapeHtml(entry.name)}</strong>
                        <span class="feedback-entry-date">${escapeHtml(entry.timestamp)}</span>
                    </div>
                    <span class="feedback-rating" aria-label="${entry.rating} out of 5 stars">${renderStars(entry.rating)}</span>
                </div>
                <div class="feedback-entry-apps">
                    ${entry.apps.map((app) => `<span class="feedback-entry-app">${escapeHtml(app)}</span>`).join('')}
                </div>
                <p class="feedback-entry-message">${escapeHtml(entry.message)}</p>
                <div class="feedback-entry-actions">
                    <button type="button" class="feedback-vote-button ${entry.userVote === 1 ? 'is-active' : ''}" data-entry-id="${entry.id}" data-vote="1" aria-label="Upvote feedback">↑</button>
                    <button type="button" class="feedback-vote-button ${entry.userVote === -1 ? 'is-active' : ''}" data-entry-id="${entry.id}" data-vote="-1" aria-label="Downvote feedback">↓</button>
                    <span class="feedback-vote-count">${entry.upvotes} up / ${entry.downvotes} down</span>
                </div>
            </article>
        `).join('');
    }

    function updateVote(entry, nextVote) {
        if (entry.userVote === nextVote) {
            if (nextVote === 1 && entry.upvotes > 0) entry.upvotes -= 1;
            if (nextVote === -1 && entry.downvotes > 0) entry.downvotes -= 1;
            entry.userVote = 0;
            return;
        }

        if (entry.userVote === 1 && entry.upvotes > 0) entry.upvotes -= 1;
        if (entry.userVote === -1 && entry.downvotes > 0) entry.downvotes -= 1;

        if (nextVote === 1) entry.upvotes += 1;
        if (nextVote === -1) entry.downvotes += 1;
        entry.userVote = nextVote;
    }

    buildAppOptions();
    renderEntries();
    updateFormState();

    appsContainer.addEventListener('change', updateFormState);
    messageInput.addEventListener('input', updateFormState);

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const message = messageInput.value.trim();
        const apps = getSelectedApps();
        if (!message || apps.length === 0) {
            announceStatus('Choose at least one app and write feedback before signing the guestbook.');
            updateFormState();
            return;
        }

        const entry = normalizeEntry({
            id: Date.now(),
            name: nameInput.value.trim() || 'Anonymous Visitor',
            rating: Number(ratingSelect.value) || 5,
            apps,
            message,
            timestamp: new Date().toLocaleString(),
            upvotes: 0,
            downvotes: 0,
            userVote: 0
        }, 0);

        entries.unshift(entry);
        entries = entries.slice(0, MAX_FEEDBACK_ENTRIES);
        persistEntries(entries);
        renderEntries();
        resetForm();
        nameInput.focus();
        announceStatus('Your guestbook feedback has been signed on this device.');
    });

    entriesContainer.addEventListener('click', (event) => {
        const voteButton = event.target.closest('.feedback-vote-button');
        if (!voteButton) return;

        const entryId = Number(voteButton.dataset.entryId);
        const nextVote = Number(voteButton.dataset.vote);
        const entry = entries.find((item) => item.id === entryId);
        if (!entry || ![-1, 1].includes(nextVote)) return;

        updateVote(entry, nextVote);
        persistEntries(entries);
        renderEntries();
        announceStatus(nextVote === 1 ? 'Feedback upvoted.' : 'Feedback downvoted.');
    });
})();

// 17. SageOS management panel
(function initSageOSPanel() {
    const openButton = document.getElementById('sageos-open');
    const panel = document.getElementById('sageos-panel');
    const closeButton = document.getElementById('sageos-close');
    const authStep = document.getElementById('sageos-auth-step');
    const managerStep = document.getElementById('sageos-manager-step');
    const usernameInput = document.getElementById('sageos-username');
    const passwordInput = document.getElementById('sageos-password');
    const loginButton = document.getElementById('sageos-login');
    const createButton = document.getElementById('sageos-create');
    const logoutButton = document.getElementById('sageos-logout');
    const welcome = document.getElementById('sageos-welcome');
    const roleSelect = document.getElementById('sageos-role');
    const instanceNameInput = document.getElementById('sageos-instance-name');
    const newInstanceButton = document.getElementById('sageos-new-instance');
    const duplicateInstanceButton = document.getElementById('sageos-duplicate-instance');
    const saveInstanceButton = document.getElementById('sageos-save-instance');
    const deleteInstanceButton = document.getElementById('sageos-delete-instance');
    const activeInstanceText = document.getElementById('sageos-active-instance');
    const instanceList = document.getElementById('sageos-instance-list');
    const launchButton = document.getElementById('sageos-launch');

    if (
        !openButton
        || !panel
        || !closeButton
        || !authStep
        || !managerStep
        || !usernameInput
        || !passwordInput
        || !loginButton
        || !createButton
        || !logoutButton
        || !welcome
        || !roleSelect
        || !instanceNameInput
        || !newInstanceButton
        || !duplicateInstanceButton
        || !saveInstanceButton
        || !deleteInstanceButton
        || !activeInstanceText
        || !instanceList
        || !launchButton
    ) {
        return;
    }

    let lastFocusedElement = null;
    let currentUser = '';
    let selectedInstanceId = '';

    const trap = createFocusTrap(panel, {
        initialFocus: () => (managerStep.hidden ? usernameInput : roleSelect),
        onEscape: () => closePanel()
    });

    function normalizeUsername(value) {
        return (value || '').trim().slice(0, 32);
    }

    function normalizePassword(value) {
        return (value || '').trim().slice(0, 64);
    }

    function createInstanceId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return `${Date.now()}-${Math.floor(Math.random() * 1e7)}`;
    }

    function readUsers() {
        const users = safeReadJSON(STORAGE_KEYS.sageosUsers);
        return users && typeof users === 'object' && !Array.isArray(users) ? users : {};
    }

    function writeUsers(nextUsers) {
        safeWriteStorage(STORAGE_KEYS.sageosUsers, JSON.stringify(nextUsers));
    }

    function readAllInstances() {
        const payload = safeReadJSON(STORAGE_KEYS.sageosInstances);
        return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    }

    function writeAllInstances(nextPayload) {
        safeWriteStorage(STORAGE_KEYS.sageosInstances, JSON.stringify(nextPayload));
    }

    function getUserInstances() {
        if (!currentUser) return [];
        const all = readAllInstances();
        const raw = Array.isArray(all[currentUser]) ? all[currentUser] : [];
        return raw
            .map((item, index) => normalizeInstance(item, index))
            .filter(Boolean);
    }

    function setUserInstances(instances) {
        if (!currentUser) return;
        const all = readAllInstances();
        all[currentUser] = instances.slice(0, 100);
        writeAllInstances(all);
    }

    function normalizeInstance(rawInstance, index) {
        if (!rawInstance || typeof rawInstance !== 'object') return null;
        const role = typeof rawInstance.role === 'string' && rawInstance.role.trim()
            ? rawInstance.role.trim().slice(0, 60)
            : roleSelect.value;
        const name = typeof rawInstance.name === 'string' && rawInstance.name.trim()
            ? rawInstance.name.trim().slice(0, 60)
            : `${role} Workspace ${index + 1}`;

        return {
            id: typeof rawInstance.id === 'string' && rawInstance.id.trim()
                ? rawInstance.id.trim()
                : createInstanceId(),
            name,
            role,
            status: typeof rawInstance.status === 'string' && rawInstance.status.trim()
                ? rawInstance.status.trim().slice(0, 16)
                : 'active',
            createdAt: typeof rawInstance.createdAt === 'string' && rawInstance.createdAt.trim()
                ? rawInstance.createdAt.trim()
                : new Date().toLocaleString(),
            savedAt: typeof rawInstance.savedAt === 'string' ? rawInstance.savedAt.trim().slice(0, 60) : ''
        };
    }

    function readSession() {
        const session = safeReadJSON(STORAGE_KEYS.sageosSession);
        if (!session || typeof session !== 'object') return null;
        const username = normalizeUsername(session.username);
        return username ? { username } : null;
    }

    function writeSession(username) {
        safeWriteStorage(STORAGE_KEYS.sageosSession, JSON.stringify({ username }));
    }

    function clearSession() {
        safeRemoveStorage(STORAGE_KEYS.sageosSession);
    }

    function setStep(step) {
        const managerMode = step === 'manager';
        authStep.hidden = managerMode;
        managerStep.hidden = !managerMode;
        if (managerMode) {
            welcome.textContent = `Logged in as ${currentUser}. Select a role flavor and manage your workspace instances.`;
            renderInstances();
        } else {
            passwordInput.value = '';
            selectedInstanceId = '';
        }
    }

    function getSelectedInstance(instances) {
        return instances.find((instance) => instance.id === selectedInstanceId) || null;
    }

    function setButtonsEnabled(isEnabled) {
        duplicateInstanceButton.disabled = !isEnabled;
        saveInstanceButton.disabled = !isEnabled;
        deleteInstanceButton.disabled = !isEnabled;
    }

    function renderInstances() {
        const instances = getUserInstances();

        if (instances.length === 0) {
            selectedInstanceId = '';
            activeInstanceText.textContent = 'No active workspace instance yet.';
            instanceList.innerHTML = '<p class="sageos-empty">No instances yet. Create one to get started.</p>';
            setButtonsEnabled(false);
            return;
        }

        if (!instances.some((instance) => instance.id === selectedInstanceId)) {
            selectedInstanceId = instances[0].id;
        }

        const selected = getSelectedInstance(instances);
        if (selected) {
            roleSelect.value = selected.role;
            activeInstanceText.textContent = selected.savedAt
                ? `${selected.name} · ${selected.role} · saved ${selected.savedAt}`
                : `${selected.name} · ${selected.role} · ${selected.status}`;
        } else {
            activeInstanceText.textContent = 'No active workspace instance yet.';
        }

        instanceList.innerHTML = instances.map((instance) => `
            <button type="button" class="sageos-instance-item ${instance.id === selectedInstanceId ? 'is-active' : ''}" data-instance-id="${escapeHtml(instance.id)}">
                <strong>${escapeHtml(instance.name)}</strong>
                <span>${escapeHtml(instance.role)}</span>
            </button>
        `).join('');

        setButtonsEnabled(Boolean(selected));
    }

    function buildInstanceName(role, instancesLength) {
        const candidate = instanceNameInput.value.trim();
        if (candidate) return candidate.slice(0, 60);
        return `${role} Workspace ${instancesLength + 1}`;
    }

    function createNewInstance() {
        if (!currentUser) return;
        const role = roleSelect.value;
        const instances = getUserInstances();
        const nextInstance = {
            id: createInstanceId(),
            name: buildInstanceName(role, instances.length),
            role,
            status: 'active',
            createdAt: new Date().toLocaleString(),
            savedAt: ''
        };
        instances.unshift(nextInstance);
        selectedInstanceId = nextInstance.id;
        setUserInstances(instances);
        renderInstances();
        announceStatus('New SageOS workspace instance created.');
    }

    function duplicateSelectedInstance() {
        const instances = getUserInstances();
        const source = getSelectedInstance(instances);
        if (!source) {
            announceStatus('Select an instance to duplicate.');
            return;
        }

        const copy = {
            ...source,
            id: createInstanceId(),
            name: `${source.name} Copy`.slice(0, 60),
            status: 'active',
            createdAt: new Date().toLocaleString(),
            savedAt: ''
        };
        instances.unshift(copy);
        selectedInstanceId = copy.id;
        setUserInstances(instances);
        renderInstances();
        announceStatus('Workspace instance duplicated.');
    }

    function saveSelectedInstance() {
        const instances = getUserInstances();
        const selected = getSelectedInstance(instances);
        if (!selected) {
            announceStatus('Select an instance to save.');
            return;
        }

        selected.savedAt = new Date().toLocaleString();
        selected.status = 'saved';
        setUserInstances(instances);
        renderInstances();
        announceStatus('Workspace instance saved.');
    }

    function deleteSelectedInstance() {
        const instances = getUserInstances();
        const index = instances.findIndex((instance) => instance.id === selectedInstanceId);
        if (index === -1) {
            announceStatus('Select an instance to delete.');
            return;
        }

        instances.splice(index, 1);
        selectedInstanceId = instances[0]?.id || '';
        setUserInstances(instances);
        renderInstances();
        announceStatus('Workspace instance deleted.');
    }

    function setCurrentUser(username) {
        currentUser = username;
        writeSession(username);
        setStep('manager');
    }

    function loginOrCreate(action) {
        const username = normalizeUsername(usernameInput.value);
        const password = normalizePassword(passwordInput.value);
        const users = readUsers();

        if (!username) {
            usernameInput.focus();
            announceStatus('Enter a username first.');
            return;
        }

        if (password.length < 4) {
            passwordInput.focus();
            announceStatus('Use at least 4 characters for your password.');
            return;
        }

        if (action === 'create') {
            if (users[username]) {
                announceStatus('That username already exists. Try logging in.');
                return;
            }
            users[username] = password;
            writeUsers(users);
            setCurrentUser(username);
            announceStatus('SageOS account created and logged in.');
            return;
        }

        if (!users[username] || users[username] !== password) {
            announceStatus('Invalid username or password.');
            return;
        }

        setCurrentUser(username);
        announceStatus('Logged in to SageOS.');
    }

    function launchSageOS() {
        if (!currentUser) {
            announceStatus('Log in first to launch SageOS.');
            return;
        }

        let instances = getUserInstances();
        if (instances.length === 0) {
            createNewInstance();
            instances = getUserInstances();
        }

        const selected = getSelectedInstance(instances);
        const role = selected?.role || roleSelect.value;
        const instanceName = selected?.name || `${role} Workspace`;
        const instanceId = selected?.id || createInstanceId();
        const launchUrl = new URL('sageos-launch.html', window.location.href);
        launchUrl.searchParams.set('user', currentUser);
        launchUrl.searchParams.set('role', role);
        launchUrl.searchParams.set('instance', instanceName);
        launchUrl.searchParams.set('instanceId', instanceId);
        window.open(launchUrl.toString(), '_blank', 'noopener');
        announceStatus('Launching SageOS workspace.');
    }

    function openPanel() {
        lastFocusedElement = document.activeElement;
        panel.hidden = false;
        document.body.classList.add('panel-open');
        openButton.setAttribute('aria-expanded', 'true');
        trap.activate();
        announceStatus('SageOS panel opened.');
    }

    function closePanel({ returnFocus = true } = {}) {
        if (panel.hidden) return;
        panel.hidden = true;
        document.body.classList.remove('panel-open');
        openButton.setAttribute('aria-expanded', 'false');
        trap.deactivate();

        if (returnFocus) {
            const focusTarget = lastFocusedElement && typeof lastFocusedElement.focus === 'function'
                ? lastFocusedElement
                : openButton;
            focusTarget.focus();
        }

        announceStatus('SageOS panel closed.');
    }

    openButton.addEventListener('click', () => {
        if (panel.hidden) {
            openPanel();
            return;
        }
        closePanel({ returnFocus: false });
    });

    closeButton.addEventListener('click', () => {
        closePanel();
    });

    document.addEventListener('mousedown', (event) => {
        if (panel.hidden) return;
        if (panel.contains(event.target) || openButton.contains(event.target)) return;
        closePanel({ returnFocus: false });
    });

    loginButton.addEventListener('click', () => {
        loginOrCreate('login');
    });

    createButton.addEventListener('click', () => {
        loginOrCreate('create');
    });

    passwordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            loginOrCreate('login');
        }
    });

    logoutButton.addEventListener('click', () => {
        clearSession();
        currentUser = '';
        selectedInstanceId = '';
        usernameInput.value = '';
        passwordInput.value = '';
        setStep('auth');
        usernameInput.focus();
        announceStatus('Logged out of SageOS.');
    });

    newInstanceButton.addEventListener('click', createNewInstance);
    duplicateInstanceButton.addEventListener('click', duplicateSelectedInstance);
    saveInstanceButton.addEventListener('click', saveSelectedInstance);
    deleteInstanceButton.addEventListener('click', deleteSelectedInstance);
    launchButton.addEventListener('click', launchSageOS);

    roleSelect.addEventListener('change', () => {
        const instances = getUserInstances();
        const selected = getSelectedInstance(instances);
        if (!selected) return;
        selected.role = roleSelect.value;
        selected.status = 'active';
        setUserInstances(instances);
        renderInstances();
    });

    instanceList.addEventListener('click', (event) => {
        const item = event.target.closest('.sageos-instance-item');
        if (!item) return;
        selectedInstanceId = item.dataset.instanceId || '';
        renderInstances();
    });

    const initialSession = readSession();
    const users = readUsers();
    if (initialSession?.username && users[initialSession.username]) {
        currentUser = initialSession.username;
        setStep('manager');
    } else {
        setStep('auth');
    }

    openButton.setAttribute('aria-expanded', 'false');
})();

// 18. Keyboard shortcuts overlay
(function initKeyboardShortcuts() {
    const overlay = document.getElementById('shortcuts-overlay');
    const closeButton = document.getElementById('shortcuts-close');
    const searchField = document.getElementById('suite-search');
    const badge = document.getElementById('visitor-badge');
    const audioToggle = document.getElementById('audio-toggle');
    const sharkboardToggle = document.getElementById('sharkboard-toggle');
    if (!overlay || !closeButton) return;

    let returnFocus = null;
    let pendingG = false;
    let pendingGTimer = null;
    const gWindowMs = 800;

    const trap = createFocusTrap(overlay, {
        initialFocus: () => closeButton,
        onEscape: () => closeOverlay()
    });

    function isTypingTarget(target) {
        if (!target) return false;
        const tagName = target.tagName;
        return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;
    }

    function setPendingG() {
        pendingG = true;
        clearTimeout(pendingGTimer);
        pendingGTimer = setTimeout(() => {
            pendingG = false;
        }, gWindowMs);
    }

    function openOverlay() {
        returnFocus = document.activeElement;
        overlay.hidden = false;
        trap.activate();
        announceStatus('Keyboard shortcuts opened.');
    }

    function closeOverlay() {
        if (overlay.hidden) return;
        overlay.hidden = true;
        trap.deactivate();
        if (returnFocus && typeof returnFocus.focus === 'function') {
            returnFocus.focus();
        }
        returnFocus = null;
        announceStatus('Keyboard shortcuts closed.');
    }

    function handleKeydown(event) {
        if (event.key === 'Escape' && !overlay.hidden) {
            event.preventDefault();
            closeOverlay();
            return;
        }

        if (isTypingTarget(event.target)) return;

        if (event.key === '?') {
            event.preventDefault();
            if (overlay.hidden) openOverlay(); else closeOverlay();
            return;
        }

        if (!overlay.hidden) return;

        if (event.key === '/') {
            if (searchField) {
                event.preventDefault();
                searchField.focus();
                searchField.select();
            }
            return;
        }

        if (event.key === 'm' && badge) {
            event.preventDefault();
            badge.click();
            return;
        }

        if (event.key === 'a' && audioToggle) {
            event.preventDefault();
            audioToggle.click();
            return;
        }

        if (event.key === 'b' && sharkboardToggle) {
            event.preventDefault();
            sharkboardToggle.click();
            return;
        }

        if (event.key === 'g') {
            setPendingG();
            return;
        }

        if (pendingG) {
            pendingG = false;
            clearTimeout(pendingGTimer);

            if (event.key === 'h') {
                event.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            if (event.key === 's') {
                event.preventDefault();
                const suite = document.getElementById('suite');
                if (suite) suite.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    window.addEventListener('keydown', handleKeydown);
    closeButton.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closeOverlay();
        }
    });
})();
