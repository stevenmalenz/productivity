// One thing — content bridge
//
// Injected ONLY on the One thing app's own origin (see manifest matches). It
// does two things and nothing else:
//   1. Announces "the recorder is installed" so the app can light up its
//      Activity UI (a dataset marker + a postMessage handshake).
//   2. Relays the app's time-range queries to the background worker and posts
//      the answer back. The app never touches chrome.* and never learns the
//      extension's id; everything is origin-scoped window messaging.

(function () {
  'use strict';
  const VERSION = '1.0.0';

  try {
    document.documentElement.dataset.onethingTracker = VERSION;
  } catch (e) {}

  function announce() {
    window.postMessage({ source: 'onething-ext', type: 'hello', version: VERSION }, '*');
  }
  announce();
  window.addEventListener('DOMContentLoaded', announce);
  window.addEventListener('load', announce);

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.source !== 'onething-app') return;

    if (d.type === 'ot_hello?') {
      announce();
      return;
    }
    if (d.type !== 'ot_query' && d.type !== 'ot_ping') return;

    const id = d.id;
    const reply = (payload) =>
      window.postMessage({ source: 'onething-ext', type: 'response', id, payload }, '*');

    try {
      chrome.runtime.sendMessage(
        { type: d.type, from: d.from, to: d.to },
        (payload) => {
          if (chrome.runtime.lastError) reply(null);
          else reply(payload);
        }
      );
    } catch (e) {
      reply(null);
    }
  });
})();
