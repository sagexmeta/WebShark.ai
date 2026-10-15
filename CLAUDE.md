# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

Static single-page site for the WebShark.ai suite landing page. Three files, no build, no framework, no package manager:

- `index.html` — markup, references `styles.css` and `script.js`.
- `script.js` — vanilla JS, 17 numbered feature blocks (see below), runs top-to-bottom on load.
- `styles.css` — vanilla CSS, custom properties on `:root`, two `body::before/::after` background layers, plus a fixed `#cursor-glow`, `#bubble-field` canvas, and `#scroll-progress-bar`.

There is no `package.json`, no bundler, no linter, no test framework, and no transpilation. Open `index.html` directly or serve the folder statically (e.g. `python -m http.server 8000`) — that is the entire dev loop.

## Develop / preview

- **Local preview**: any static server pointed at this folder. No build step required.
- **Verify a change**: reload in a browser. Visual/JS changes are all observable in the running page; there is no automated test to run.

## Architecture conventions

### Suite cards are the heart of the page

Each entry in `.suite-grid` is an `<a class="card reveal" data-tags="...">` with:
- `href` to the external tool (GitHub Pages, `pages.dev`, `hf.space`, etc.).
- `data-tags` — **space-separated** keyword list used by the search/filter (must match a chip `data-tag` value or the card is unreachable via chip filter).
- `<div class="card-icon">emoji</div>`, injected `.card-meta` pills, `<h3>title</h3>`, `<p><span class="shimmer-word">description</span></p>`.

Adding/removing a card means also updating the chip set in the same file if a new tag is needed. The card contract is read by `initCardMetadata`, `initSuiteSearch` (`script.js`), `initCardBiteFeedback`, and the IntersectionObserver-driven `.reveal` stagger.

### `script.js` is organized as 17 numbered feature blocks

They are sequential, top-level statements (not a single IIFE), and several rely on DOM order — do not reorder without checking. In order:

1. Shared visitor counter (CounterAPI-backed).
2. Card 3D tilt + cursor light tracking (reads `prefersReducedMotionEarly`).
3. Scroll-driven `--scroll-y` parallax, `--scroll-progress`, and back-to-top visibility.
4. `.reveal` IntersectionObserver (staggered by `transitionDelay`).
5. Shark-cursor mode toggle (bound to the visitor badge; click also triggers the swarm easter egg at the same target).
6. `#bubble-field` canvas — rising bubbles, paused on `visibilitychange`.
7. Shimmer hover effect on `.shimmer-word`.
8. `#scroll-cue` smooth-scroll to `#suite`; hidden when the hero is out of view.
9. `#back-to-top` shark-fin button.
10. `initCardMetadata` — visible pills generated from `data-tags`.
11. `initSuiteSearch` — text + chip filter with URL state, result counts, and reset control.
12. `initAmbientAudio` — lazy-loaded YouTube IFrame API, muted-by-default, auto-unmuted on first user gesture if the visitor has not muted previously.
13. `initCardBiteFeedback` — `🦈` bite mark on click, 260ms delay before navigation.
14. `initSharkSwarmEasterEgg` — triple-click the visitor badge within 900ms to spawn a swarm.
15. `initSharkBoard` — browser-local SharkBoard panel backed by versioned `localStorage` plus focus management.
16. `initExperienceGuestbook` — browser-local feedback guestbook with app tagging and up/down voting.
17. `initKeyboardShortcuts` — shortcuts overlay plus `/`, `a`, `b`, `m`, and `g` sequences.

`prefersReducedMotionEarly` is captured once at the top of the file and gates the more aggressive animations. `prefersReducedMotion` is currently aliased from it and is used for the lower-cost background effects.

### CSS custom properties written from JS

When touching these, update both sides:
- `--mouse-x`, `--mouse-y` (per-card, written by block 2; consumed by `.card::before` radial gradient).
- `--scroll-y` (on `body`, written by block 3; consumed by `body::before` transform).
- `--glow-x`, `--glow-y` (on `documentElement`, written by the shared pointer logic; consumed by `#cursor-glow`).
- `--scroll-progress` (on `documentElement`, written by block 3; consumed by `#scroll-progress-bar` width).

### Ambient audio (YouTube IFrame API)

- `window.onYouTubeIframeAPIReady` must stay a **global** — the YouTube API calls it.
- The video ID is hard-coded in `initAmbientAudio` (currently `vIDr8ZnCLQw`); change it there.
- The API script is injected lazily by `ensureYouTubeAPI()`; do not reintroduce a static `<script src="https://www.youtube.com/iframe_api">` tag unless you intentionally want eager loading again.
- Player is created muted (`mute: 1`) because most browsers block unmuted autoplay. The first user gesture (`click` / `keydown` / `touchstart` / `scroll`) flips to unmuted if the visitor hasn't explicitly muted before.
- The visitor's preference is persisted in `localStorage` under the key `webshark-audio-unmuted` (string `"true"` / `"false"`). The default is unmuted — i.e. music-on unless the visitor has muted it before.

### Motion / accessibility

- The whole file honors `prefers-reduced-motion: reduce` aggressively — bubble field, cursor glow, aurora drift, chevron bounce, card bite, and shark swarm all disable. New animations should follow the same pattern.
- All interactive elements (cards, chips, search, audio toggle, back-to-top) have explicit `:focus-visible` outlines; preserve them when restyling.

### SharkBoard

- SharkBoard is currently browser-local and persists posts in `localStorage` under the key `sharkboard-posts-v1`.
- `script.js` still migrates from the legacy `sharkboard-posts` array key; preserve that migration path unless you explicitly remove support for older stored boards.
- The toggle button should keep `aria-expanded` in sync with the panel state.
- If future work reintroduces shared persistence, remove or rewrite the local-storage assumptions above instead of layering a second implementation beside them.

### Experience guestbook

- The guestbook is currently browser-local and persists entries in `localStorage` under the key `webshark-feedback-v1`.
- Available app choices are derived from the live suite card titles, so renaming a card also renames the feedback option shown in the guestbook.
- Entries support browser-local upvotes and downvotes; those vote states are stored alongside each entry payload.

### External links

Card hrefs point to subdomains owned by the author (`colesr.github.io`, `webshark-email.pages.dev`, `colesr-insight-engine-docker.hf.space`, etc.). These are not in this repo — they are separate deployments. When updating copy or icons in a card, do not assume the linked app reflects the same description.
