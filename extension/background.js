// One thing — activity recorder (background service worker, MV3)
//
// A deliberately dumb, privacy-respecting time-on-domain recorder. It knows
// nothing about your tasks. It records only the *hostname* of your focused tab
// (e.g. "youtube.com") plus timestamps — never URLs, titles, or page contents —
// and only while you're actively at the computer with a Chrome window focused.
//
// MV3 service workers are ephemeral (Chrome kills them after ~30s idle), so we
// NEVER hold tracking state in memory: every event reads from and writes back to
// chrome.storage.local, and all listeners are registered at the top level.

const VERSION = '1.0.0';
const IDLE_SECONDS = 60;
const RETAIN_MS = 7 * 24 * 60 * 60 * 1000; // forget anything older than 7 days
const MIN_SEGMENT_MS = 1000;               // ignore sub-second flickers
const MAX_SEGMENTS = 5000;                  // hard cap so storage can't grow unbounded

chrome.idle.setDetectionInterval(IDLE_SECONDS);

function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

// The active tab's host — but only when we're allowed to accrue (not idle, a
// Chrome window is focused). Otherwise null, which records the gap as "away".
async function currentHost(idle, blurred) {
  if (idle || blurred) return { host: null, favicon: null };
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return { host: null, favicon: null };
    return { host: hostOf(tab.url || tab.pendingUrl), favicon: tab.favIconUrl || null };
  } catch (e) {
    return { host: null, favicon: null };
  }
}

// Serialize read-modify-write so two events firing in the same worker lifetime
// can't interleave and clobber each other's storage write.
let chain = Promise.resolve();
function queue(fn) {
  chain = chain.then(fn).catch((e) => console.debug('[onething]', e));
  return chain;
}

// Close the currently-open segment and open a fresh one for whatever's active
// now. `patch` carries idle/blurred updates from the event that triggered us.
function recompute(reason, patch) {
  return queue(async () => {
    const o = await chrome.storage.local.get(['cursor', 'segments', 'favicons', 'idle', 'blurred']);
    let idle = o.idle || false;
    let blurred = o.blurred || false;
    if (patch && 'idle' in patch) idle = patch.idle;
    if (patch && 'blurred' in patch) blurred = patch.blurred;

    const now = Date.now();
    let segments = o.segments || [];
    const cursor = o.cursor || null;
    const favicons = o.favicons || {};

    // Close the open segment.
    if (cursor && cursor.host && cursor.since != null) {
      const dur = now - cursor.since;
      if (dur >= MIN_SEGMENT_MS && dur < RETAIN_MS) {
        segments.push({ h: cursor.host, s: cursor.since, e: now });
      }
    }

    // Open the next segment.
    const { host, favicon } = await currentHost(idle, blurred);
    if (host && favicon) favicons[host] = favicon;

    // Prune to the retention window and cap.
    const cutoff = now - RETAIN_MS;
    segments = segments.filter((g) => g.e >= cutoff);
    if (segments.length > MAX_SEGMENTS) segments = segments.slice(segments.length - MAX_SEGMENTS);

    await chrome.storage.local.set({
      cursor: { host: host || null, since: now },
      segments,
      favicons,
      idle,
      blurred,
    });
  });
}

// ── Events (registered at top level per MV3 requirements) ────────────────────
chrome.tabs.onActivated.addListener(() => recompute('activated'));
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === 'complete' || info.url) recompute('updated');
});
chrome.windows.onFocusChanged.addListener((winId) => {
  recompute('focus', { blurred: winId === chrome.windows.WINDOW_ID_NONE });
});
chrome.idle.onStateChanged.addListener((s) => {
  recompute('idle', { idle: s !== 'active' });
});
chrome.runtime.onStartup.addListener(() => recompute('startup'));
chrome.runtime.onInstalled.addListener(() => {
  chrome.idle.setDetectionInterval(IDLE_SECONDS);
  recompute('installed');
});

// ── Query API (called by content.js on the app's behalf) ─────────────────────
async function queryRange(from, to) {
  from = Number(from);
  to = Number(to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return { total: 0, idle: 0, hosts: [] };
  }
  const o = await chrome.storage.local.get(['cursor', 'segments', 'favicons']);
  const segments = (o.segments || []).slice();
  const favicons = o.favicons || {};

  // Include the still-open segment, clipped to now.
  const cursor = o.cursor || null;
  if (cursor && cursor.host && cursor.since != null) {
    segments.push({ h: cursor.host, s: cursor.since, e: Date.now() });
  }

  const totals = {};
  for (const g of segments) {
    const s = Math.max(g.s, from);
    const e = Math.min(g.e, to);
    if (e > s) totals[g.h] = (totals[g.h] || 0) + (e - s);
  }
  const hosts = Object.keys(totals)
    .map((h) => ({ host: h, ms: totals[h], favicon: favicons[h] || null }))
    .sort((a, b) => b.ms - a.ms);

  const onScreen = hosts.reduce((a, h) => a + h.ms, 0);
  const total = to - from;
  return { total, idle: Math.max(0, total - onScreen), hosts };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'ot_ping') {
    sendResponse({ ok: true, version: VERSION });
    return;
  }
  if (msg.type === 'ot_query') {
    queryRange(msg.from, msg.to).then(sendResponse);
    return true; // keep the channel open for the async response
  }
});
