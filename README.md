# WebShark.ai

WebShark.ai is a static landing page for the broader WebShark suite. It highlights the collection, lets visitors browse by category, and includes a lightweight in-browser SharkBoard for sharing short posts locally.

![Swimming Shark](./shark.svg)

## What is in this repo

- `index.html` - page structure and suite catalog
- `styles.css` - visual design, animations, and responsive styling
- `script.js` - interaction logic for search, filters, audio, shortcuts, and SharkBoard
- `about.html` / `about.css` - creator profile and supporting header styles
- `sageos-launch.html` / `sageos-launch.css` / `sageos-launch.js` - SageOS launch simulation and workspace orchestration
- `sageos-workspace.html` / `sageos-workspace.css` / `sageos-workspace.js` - customizable workspace desktop and app launcher

There is no build step, framework, or package manager.

## Local preview

Open `index.html` directly in a browser, or serve the directory with any static server.

Example:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Current behavior

- the header shows a live visitor count when CounterAPI is available
- suite cards can be filtered by category or searched by text
- the suite toolbar shows result counts, active filter state, and a reset control
- visible metadata pills summarize each suite card's categories
- visitors can sign an experience guestbook, tag which apps they tried, and react with upvotes/downvotes
- keyboard shortcuts are available via `?`
- ambient audio is optional, visitor-controlled, and lazily loads the YouTube player
- non-critical motion effects are deferred to idle time to protect first-load responsiveness
- skip-to-content navigation and improved metadata are included for accessibility and SEO quality
- SharkBoard and the feedback guestbook store entries in `localStorage`, so their content is browser-local rather than shared across devices

## Maintenance notes

- when adding a new suite card, keep its `data-tags` aligned with an available filter chip
- guestbook app choices are derived from suite card titles in `script.js`, so changing a card title changes the available feedback labels too
- if a new interaction is exposed in the UI, ensure the page actually loads the script that powers it
- SharkBoard persistence is versioned in `script.js`; preserve the migration path from the legacy `sharkboard-posts` key unless intentionally removing it
- guestbook persistence is versioned under `webshark-feedback-v1`; keep the payload shape stable unless you intentionally migrate it
- ambient audio still depends on the global `window.onYouTubeIframeAPIReady` hook even though the API script now loads on demand


