# One thing — "where your time went" companion

A tiny, optional browser extension for the [One thing](../) app. The app can't see
your other tabs (browsers sandbox pages from one another), so this companion does the
seeing — and it's built to see as little as possible.

## What it records

- **Only the hostname** of whatever tab is focused (e.g. `youtube.com`) plus the
  timestamps you were there.
- **Never** URLs, page titles, page contents, form data, or your task text.
- Only while you're **actively at the computer** with a Chrome window focused
  (it pauses on idle and when you leave the browser).

## What it does *not* do

- No accounts, no servers, no network requests. Data lives only in the extension's
  local storage and is **auto-forgotten after 7 days**.
- It never initiates anything. The app asks "what hosts did I see between time A and
  time B?" and it answers. That's the whole conversation.

## Install (developer / unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Open the One thing app, click the gear → **Activity**, and it should read
   **Connected**. Flip on "Track where my time goes."

Uninstall or disable the extension any time to stop completely.

## How it connects

`content.js` is injected only on the app's own origin. It sets a marker on the page
and relays the app's time-range queries to `background.js` (the recorder) via
origin-scoped `window.postMessage`. No extension id is hardcoded anywhere, so an
unpacked/self-installed build works the same as a published one.

## Files

- `manifest.json` — MV3, permissions `tabs` + `idle` + `storage`, content script
  scoped to the app origin (and `localhost` for local testing).
- `background.js` — idle-aware time-on-domain recorder; all state in
  `chrome.storage.local` (MV3 workers are ephemeral).
- `content.js` — the page ↔ recorder bridge.
