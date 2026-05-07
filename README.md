# One thing.

A single-task focus app. One card on screen, until it's done. Then the next thing.

**Live:** https://stevenmalenz.github.io/productivity/

## Features

- Onboarding flow that captures the first "one thing"
- Editable card with a running timer
- Queue ("In the wings") and today's log, in a drawer
- Streak ring around a settings gear
- Time-of-day backdrop (auto / dawn / day / dusk / night)
- Optional chime on done
- Manifesto page explaining the philosophy
- All state in `localStorage` — no accounts, no sync, no backend

## Run locally

No build step. Just serve the directory:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Structure

```
index.html              — page shell, no inline JS or CSS
styles.css              — extracted styles (Fraunces + Inter, design tokens, layout, animations)
assets/
  app.js                — main app (vanilla JS, ~25KB)
  tweaks-panel.jsx      — host-protocol shell for in-browser tweaks (JSX, transpiled by Babel-standalone)
  tweaks-app.js         — companion to tweaks-panel
  vendor/
    react.development.js
    react-dom.development.js
    babel-standalone.js
  fonts/                — woff2 subsets for Fraunces 300/400 and Inter 400/500/600/700
```

## Provenance

Originally produced as a self-contained Pretext-bundled HTML artifact in a Claude.ai
design conversation. This repo is the unbundled source — gzip+base64 inlining was
decoded, asset UUIDs were replaced with sensible filenames, and the bundler runtime
was stripped. Behavior is preserved 1:1.
