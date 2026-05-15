// One thing. — single-task focus app
(function () {
  'use strict';

  const STORE_KEY = 'onething.v2';
  const el = (id) => document.getElementById(id);

  /** ---------- State ---------- */
  const defaultState = {
    current: '',
    stack: [],
    sound: true,
    moodOverride: 'auto',
    timerStart: null,
    counterStyle: 'count',
    onboarded: false,
    log: {},          // { 'YYYY-MM-DD': [{text, ts, note?}] }
    lastSeen: null,   // YYYY-MM-DD of last app open
    currentNote: '',  // free-form journal for the current task
    released: {},     // { 'YYYY-MM-DD': [{text, ts}] } — things you took off the plate
  };

  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { ...defaultState };
      return { ...defaultState, ...JSON.parse(raw) };
    } catch (e) { return { ...defaultState }; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function isoFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  function todayISO() { return isoFromDate(new Date()); }
  function shiftISO(iso, days) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return isoFromDate(d);
  }

  /** ---------- Streak (consecutive days with at least 1 done) ---------- */
  function computeStreak() {
    let streak = 0;
    let cursor = todayISO();
    // If today has none, start counting from yesterday
    if (!(state.log[cursor] && state.log[cursor].length)) {
      cursor = shiftISO(cursor, -1);
    }
    while (state.log[cursor] && state.log[cursor].length) {
      streak += 1;
      cursor = shiftISO(cursor, -1);
    }
    return streak;
  }
  function last7Days() {
    const arr = [];
    const today = todayISO();
    for (let i = 6; i >= 0; i--) {
      const iso = shiftISO(today, -i);
      arr.push({ iso, count: (state.log[iso] || []).length });
    }
    return arr;
  }

  /** ---------- DOM refs ---------- */
  const cardEl = el('card');
  const cardWrap = el('cardwrap');
  const thingEl = el('thing');
  const doneBtn = el('done-btn');
  const timerEl = el('timer');
  const streakLabel = el('streak-label');
  const streakCountEl = el('streak-count');
  const streakDays = el('streak-days');
  const hintEl = el('hint');
  const greetingEl = el('greeting');
  const gearBtn = el('gear');
  const gearRing = el('gear-ring');
  const popoverEl = el('popover');
  const swatchesEl = el('swatches');
  const soundRow = el('sound-row');
  const soundState = el('sound-state');
  const clearRow = el('clear-row');
  const logRow = el('log-row');
  const logCount = el('log-count');
  const manifestoRow = el('manifesto-row');
  const manifestoEl = el('manifesto');
  const manifestoClose = el('manifesto-close');
  const counterZone = el('counterzone');
  const counterBtn = el('counter');
  const countNum = el('count-num');
  const scrim = el('scrim');
  const drawer = el('drawer');
  const drawerList = el('drawer-list');
  const logList = el('log-list');
  const releasedList = el('released-list');
  const drawerTitle = el('drawer-title');
  const drawerSub = el('drawer-sub');
  const queuePane = el('queue-pane');
  const addInput = el('add-input');
  const addBtn = el('add-btn');
  const completeOverlay = el('complete-overlay');
  const motes = el('motes');
  const asideTab = el('aside-tab');
  const asidePanel = el('aside-panel');
  const asideScrim = el('aside-scrim');
  const asideText = el('aside-text');
  const asideClose = el('aside-close');
  const exportRow = el('export-row');
  const importRow = el('import-row');
  const importFile = el('import-file');
  const affirmEl = el('affirm');

  /** ---------- Motion (motion.dev) ----------
   * A thin layer on top of the Motion library. Falls back to no-op when
   * Motion isn't loaded or the user prefers reduced motion. Used for the
   * discrete, event-triggered animations (taps, opens, list staggers,
   * count-ups, completion fanfare). The ambient CSS animations (drift,
   * breathe, livepulse, timerpulse) keep running on their own.
   */
  const M = (typeof window !== 'undefined' && window.Motion) || null;
  const reduceMotion = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionOn = !!(M && M.animate) && !reduceMotion;
  if (motionOn) document.body.classList.add('motion-on');

  const noopAnim = { stop() {}, cancel() {}, finished: Promise.resolve(),
                     then(cb) { return Promise.resolve().then(cb); } };
  function mAnimate(target, keyframes, options) {
    if (!motionOn || !target) return noopAnim;
    try { return M.animate(target, keyframes, options); }
    catch (e) { return noopAnim; }
  }
  function mStagger(delay, opts) {
    if (motionOn && M.stagger) return M.stagger(delay, opts);
    return (i) => i * (delay || 0.06);
  }
  const springy = { type: 'spring', stiffness: 320, damping: 22 };
  const softSpring = { type: 'spring', stiffness: 200, damping: 26 };
  const snappy = { type: 'spring', stiffness: 420, damping: 18 };
  const ease = [0.2, 0.8, 0.2, 1];

  // Hover/press helpers — graceful no-op if Motion not loaded.
  if (motionOn && M.hover) {
    M.hover('.stack-item', (target) => {
      mAnimate(target, { scale: 1.012 }, { duration: 0.2, ease });
      return () => mAnimate(target, { scale: 1 }, { duration: 0.25, ease });
    });
    M.hover('.swatch', (target) => {
      mAnimate(target, { scale: 1.18 }, softSpring);
      return () => mAnimate(target, { scale: 1 }, softSpring);
    });
    M.hover('.gear', (target) => {
      mAnimate(target, { rotate: 40 }, springy);
      return () => mAnimate(target, { rotate: 0 }, softSpring);
    });
    M.hover('.counter', (target) => {
      mAnimate(target, { scale: 1.04 }, springy);
      return () => mAnimate(target, { scale: 1 }, softSpring);
    });
  }
  if (motionOn && M.press) {
    M.press('.swatch', (target) => {
      mAnimate(target, { scale: [1.18, 0.85, 1.2, 1] },
               { duration: 0.55, ease: 'easeOut' });
    });
    M.press('.gear', (target) => {
      mAnimate(target, { rotate: [0, 90] }, snappy);
    });
  }

  // Animate a number's text from a -> b (count-up).
  function tickNumber(node, from, to, dur = 0.6) {
    if (!motionOn || from === to) {
      if (node) node.textContent = String(to);
      return;
    }
    mAnimate(from, to, {
      duration: dur,
      ease,
      onUpdate: (v) => { node.textContent = String(Math.round(v)); }
    });
  }

  /** ---------- Mood ---------- */
  function computeMood() {
    if (state.moodOverride && state.moodOverride !== 'auto') return state.moodOverride;
    const h = new Date().getHours();
    if (h < 6) return 'night';
    if (h < 11) return 'dawn';
    if (h < 17) return 'day';
    if (h < 20) return 'dusk';
    return 'night';
  }
  const moods = {
    dawn:  { g1:'radial-gradient(circle at 30% 30%, #ffd7c2 0%, #ffeed8 38%, #ffffff 75%)',
             g2:'radial-gradient(circle at 70% 70%, #ffd7f0 0%, #fff2da 50%, #ffffff 80%)', label:'Morning' },
    day:   { g1:'radial-gradient(circle at 30% 30%, #c6ece9 0%, #d0b2ff 45%, #ffffff 80%)',
             g2:'radial-gradient(circle at 70% 70%, #d0b2ff 0%, #c6ece9 50%, #ffffff 82%)', label:'Daylight' },
    dusk:  { g1:'radial-gradient(circle at 30% 30%, #ffd7f0 0%, #fbc768 45%, #ffffff 82%)',
             g2:'radial-gradient(circle at 70% 70%, #e16540 0%, #ffd7f0 45%, #ffffff 80%)', label:'Dusk' },
    night: { g1:'radial-gradient(circle at 30% 30%, #b4a4e8 0%, #d3c7f0 45%, #ffffff 90%)',
             g2:'radial-gradient(circle at 70% 70%, #d0b2ff 0%, #e2ddfd 55%, #ffffff 88%)', label:'Night' }
  };
  function applyMood() {
    const m = moods[computeMood()];
    document.documentElement.style.setProperty('--g1', m.g1);
    document.documentElement.style.setProperty('--g2', m.g2);
    document.body.style.color = '#111';
    cardEl.style.background = 'rgba(255,255,255,0.78)';
    thingEl.style.color = '#111111';
    swatchesEl.querySelectorAll('.swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.mood === (state.moodOverride || 'auto'));
    });
  }

  /** ---------- Card / thing edit lifecycle ---------- */
  let editing = false;
  let editBuffer = '';

  function setHint(text) { hintEl.innerHTML = text; }

  let prevDoneDisabled = true;
  function renderThing() {
    const v = state.current || '';
    if (!v && !editing) {
      thingEl.classList.add('empty');
      thingEl.textContent = '';
      doneBtn.disabled = true;
      cardWrap.classList.add('empty-state');
      setHint('');
    } else {
      thingEl.classList.remove('empty');
      if (!editing) thingEl.textContent = v;
      doneBtn.disabled = !v && !editing;
      cardWrap.classList.remove('empty-state');
      // While editing, the in-card edit-bar already shows the shortcuts.
      setHint(editing ? '' : 'Click text to edit · <kbd>⌘⏎</kbd> mark done');
    }
    // When the button transitions from disabled → enabled, give it a
    // small reassuring nudge so it reads as alive.
    if (motionOn && prevDoneDisabled && !doneBtn.disabled) {
      mAnimate(doneBtn, { scale: [1, 1.06, 1] },
        { duration: 0.45, ease: 'easeOut' });
    }
    prevDoneDisabled = doneBtn.disabled;
  }

  function startEdit() {
    if (editing) return;
    editing = true;
    editBuffer = state.current || '';
    cardEl.classList.add('editing');
    thingEl.classList.remove('empty');
    if (!thingEl.textContent) thingEl.textContent = '';
    thingEl.focus();
    placeCaretAtEnd(thingEl);
    doneBtn.disabled = false;
    setHint('');
  }

  function commitEdit() {
    if (!editing) return;
    const v = thingEl.textContent.trim();
    if (v && v !== state.current) {
      // New / changed thing — start timer fresh
      state.current = v;
      state.timerStart = Date.now();
    } else if (!v) {
      // Clearing the current task to empty is a deliberate "off the plate" act
      const prev = state.current;
      state.current = '';
      state.timerStart = null;
      // No task means no aside note
      state.currentNote = '';
      if (prev && prev.trim()) logReleased(prev);
    }
    editing = false;
    cardEl.classList.remove('editing');
    thingEl.blur();
    save();
    renderThing();
    renderAside();
  }

  function cancelEdit() {
    if (!editing) return;
    editing = false;
    cardEl.classList.remove('editing');
    thingEl.textContent = state.current || '';
    thingEl.blur();
    renderThing();
  }

  // Click on card or text → enter edit mode
  cardEl.addEventListener('click', (e) => {
    if (drawer.classList.contains('open')) return;
    // Don't trigger when clicking the Done button
    if (doneBtn.contains(e.target)) return;
    if (!editing) {
      e.preventDefault();
      startEdit();
    }
  });

  // Prevent the contenteditable from auto-stealing focus on every click — we control it.
  thingEl.addEventListener('mousedown', (e) => {
    if (!editing) {
      e.preventDefault();
      startEdit();
    }
  });

  thingEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commitEdit();
      // Slight defer to let render settle
      setTimeout(complete, 60);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });

  // Click anywhere outside the card while editing → commit
  document.addEventListener('mousedown', (e) => {
    if (!editing) return;
    if (cardEl.contains(e.target)) return;
    if (popoverEl.contains(e.target) || drawer.contains(e.target)) return;
    commitEdit();
  });

  function placeCaretAtEnd(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** ---------- Timer ---------- */
  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60), r = s % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60), mm = m % 60;
      return `${h}:${String(mm).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
    }
    return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
  }
  function fmtTime(ts) {
    const d = new Date(ts);
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12;
    if (h === 0) h = 12;
    return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2,'0')}${ampm}`;
  }
  function tickTimer() {
    timerEl.textContent = (state.current && state.timerStart)
      ? fmt(Date.now() - state.timerStart) : '00:00';
    updateDocTitle();
  }
  setInterval(tickTimer, 1000);

  function updateDocTitle() {
    const cur = (state.current || '').trim();
    if (!cur) { document.title = "What's next?"; return; }
    const truncated = cur.length > 40 ? cur.slice(0, 37) + '…' : cur;
    if (state.timerStart) {
      document.title = `${fmt(Date.now() - state.timerStart)} · ${truncated}`;
    } else {
      document.title = truncated;
    }
  }

  /** ---------- Streak / log render ---------- */
  let prevStreakDays = 0;
  function renderStreak() {
    const todayCount = (state.log[todayISO()] || []).length;
    streakLabel.textContent = todayCount === 1 ? '1 done today' : `${todayCount} done today`;
    const days = computeStreak();
    tickNumber(streakCountEl, prevStreakDays, days, 0.7);
    prevStreakDays = days;

    // Ring around gear: progress = consecutive days in last 7
    const days7 = last7Days();
    const filled = days7.filter(d => d.count > 0).length;
    const C = 2 * Math.PI * 24;
    const fg = gearRing.querySelector('circle.fg');
    fg.setAttribute('stroke-dasharray', String(C));
    const targetOffset = C * (1 - filled / 7);
    if (motionOn) {
      mAnimate(fg, { strokeDashoffset: targetOffset }, { duration: 0.9, ease });
    } else {
      fg.setAttribute('stroke-dashoffset', String(targetOffset));
    }
    gearRing.classList.toggle('dim', filled === 0);

    streakDays.innerHTML = days7.map(d =>
      `<span class="streak-dot" style="width:6px;height:6px;border-radius:50%;background:${d.count>0?'var(--color-engagement-gold)':'rgba(17,17,17,0.12)'};display:inline-block;"></span>`
    ).join('');
    if (motionOn) {
      mAnimate(streakDays.querySelectorAll('.streak-dot'),
        { opacity: [0, 1], scale: [0.4, 1] },
        { duration: 0.4, delay: mStagger(0.04), ease });
    }

    logCount.textContent = todayCount === 0 ? '—' : `${todayCount} done`;
  }

  /** ---------- Counter ---------- */
  let prevStackLen = 0;
  function renderCounter() {
    const next = state.stack.length;
    tickNumber(countNum, prevStackLen, next, 0.5);
    if (motionOn && next !== prevStackLen) {
      mAnimate(countNum, { scale: [1, 1.35, 1] }, { duration: 0.55, ease: 'easeOut' });
    }
    prevStackLen = next;

    const existing = counterZone.querySelector('.ministack');
    if (existing) existing.remove();
    if (state.counterStyle === 'mini' && state.stack.length > 0) {
      const mini = document.createElement('div');
      mini.className = 'ministack';
      const top = state.stack.slice(-Math.min(3, state.stack.length));
      top.forEach((t, i) => {
        const c = document.createElement('div');
        c.className = 'ms-card';
        c.textContent = t;
        c.style.opacity = String(0.5 + i * 0.18);
        c.style.transform = `scale(${0.92 + i * 0.04})`;
        mini.appendChild(c);
      });
      counterZone.insertBefore(mini, counterBtn);
      if (motionOn) {
        mAnimate(mini.querySelectorAll('.ms-card'),
          { opacity: [0, null], y: [10, 0] },
          { duration: 0.45, delay: mStagger(0.05), ease });
      }
    }
  }
  counterBtn.addEventListener('mouseenter', () => {
    if (state.counterStyle !== 'expand' || state.stack.length === 0) return;
    let mini = counterZone.querySelector('.ministack');
    if (!mini) {
      mini = document.createElement('div'); mini.className = 'ministack';
      counterZone.insertBefore(mini, counterBtn);
    }
    mini.innerHTML = '';
    state.stack.slice(-3).forEach((t, i) => {
      const c = document.createElement('div'); c.className = 'ms-card'; c.textContent = t;
      c.style.opacity = String(0.5 + i * 0.2);
      c.style.transform = `scale(${0.92 + i * 0.04})`;
      mini.appendChild(c);
    });
    if (motionOn) {
      mAnimate(mini.querySelectorAll('.ms-card'),
        { opacity: [0, null], y: [12, 0] },
        { duration: 0.4, delay: mStagger(0.06), ease });
    }
  });
  counterBtn.addEventListener('mouseleave', () => {
    if (state.counterStyle !== 'expand') return;
    setTimeout(() => {
      const m = counterZone.querySelector('.ministack');
      if (m) m.remove();
    }, 160);
  });
  counterBtn.addEventListener('click', () => openDrawer('queue'));

  /** ---------- Drawer (queue + log) ---------- */
  let activeTab = 'queue';
  function openDrawer(tab) {
    setTab(tab || 'queue');
    drawer.classList.add('open');
    scrim.classList.add('open');
    if (motionOn) {
      mAnimate(drawer, { y: ['100%', '0%'] },
               { type: 'spring', stiffness: 280, damping: 30 });
      mAnimate(scrim, { opacity: [0, 1] }, { duration: 0.25, ease });
      staggerActiveDrawerRows(0.12);
    }
    setTimeout(() => activeTab === 'queue' && addInput.focus(), 200);
  }
  function closeDrawer() {
    if (motionOn) {
      mAnimate(scrim, { opacity: [1, 0] }, { duration: 0.2, ease });
      mAnimate(drawer, { y: ['0%', '100%'] }, { duration: 0.32, ease })
        .finished.then(() => {
          drawer.classList.remove('open');
          scrim.classList.remove('open');
        }).catch(() => {});
    } else {
      drawer.classList.remove('open');
      scrim.classList.remove('open');
    }
  }
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (drawer.classList.contains('open')) closeDrawer();
      else if (popoverEl.classList.contains('open')) closePopover();
      else if (manifestoEl.classList.contains('open')) closeManifesto();
    }
  });

  function setTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.drawer-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tab));
    if (tab === 'queue') {
      queuePane.style.display = '';
      logList.style.display = 'none';
      releasedList.style.display = 'none';
      drawerTitle.textContent = 'In the wings';
      drawerSub.textContent = 'Drag to reorder. Click to make it the one.';
      renderDrawer();
    } else if (tab === 'log') {
      queuePane.style.display = 'none';
      logList.style.display = '';
      releasedList.style.display = 'none';
      drawerTitle.textContent = "Today's log";
      drawerSub.textContent = 'Calm proof you showed up.';
      renderLog();
    } else {
      queuePane.style.display = 'none';
      logList.style.display = 'none';
      releasedList.style.display = '';
      drawerTitle.textContent = 'Off the plate';
      drawerSub.textContent = 'What you set down so the rest could breathe.';
      renderReleased();
    }
  }
  document.querySelectorAll('.drawer-tab').forEach(t => {
    t.addEventListener('click', () => {
      setTab(t.dataset.tab);
      if (motionOn) staggerActiveDrawerRows(0.04);
    });
  });

  function staggerActiveDrawerRows(start = 0) {
    if (!motionOn) return;
    const pane = activeTab === 'queue' ? drawerList :
                 activeTab === 'log' ? logList : releasedList;
    const rows = pane.querySelectorAll(
      '.stack-item, .log-item, .released-item, .log-day');
    if (!rows.length) return;
    mAnimate(rows, { opacity: [0, 1], y: [10, 0] },
      { duration: 0.4, delay: mStagger(0.04, { start }), ease });
  }

  function renderDrawer() {
    drawerList.innerHTML = '';
    const items = [...state.stack].reverse();
    items.forEach((text, idx) => {
      const stackIdx = state.stack.length - 1 - idx;
      const row = document.createElement('div');
      row.className = 'stack-item';
      row.draggable = true;
      row.dataset.index = String(stackIdx);
      row.innerHTML = `
        <span class="grip" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="3" cy="3" r="1"/><circle cx="9" cy="3" r="1"/><circle cx="3" cy="6" r="1"/><circle cx="9" cy="6" r="1"/><circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/></svg>
        </span>
        <span class="text"></span>
        <button class="promote" title="Make this the one">make this the one</button>
        <button class="x" aria-label="Remove">✕</button>
      `;
      row.querySelector('.text').textContent = text;
      row.querySelector('.promote').addEventListener('click', (e) => {
        e.stopPropagation(); promote(stackIdx);
      });
      row.querySelector('.x').addEventListener('click', (e) => {
        e.stopPropagation();
        const removed = state.stack[stackIdx];
        const finishRemove = () => {
          state.stack.splice(stackIdx, 1);
          if (removed) logReleased(removed);
          save(); renderDrawer(); renderCounter();
        };
        if (motionOn) {
          mAnimate(row, { x: [0, 24], opacity: [1, 0] },
            { duration: 0.25, ease: 'easeIn' })
            .finished.then(finishRemove).catch(finishRemove);
        } else {
          finishRemove();
        }
      });
      row.addEventListener('dragstart', (e) => {
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(stackIdx));
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        document.querySelectorAll('.stack-item.drag-over').forEach(n => n.classList.remove('drag-over'));
      });
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault(); row.classList.remove('drag-over');
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (Number.isNaN(from) || from === stackIdx) return;
        const item = state.stack.splice(from, 1)[0];
        state.stack.splice(stackIdx, 0, item);
        save(); renderDrawer(); renderCounter();
      });
      drawerList.appendChild(row);
    });
  }

  function renderLog() {
    logList.innerHTML = '';
    // Show today + yesterday + earlier (up to 7 days)
    const today = todayISO();
    const days7 = last7Days().reverse(); // newest first
    days7.forEach(({ iso }) => {
      const items = state.log[iso] || [];
      if (!items.length) return;
      const dayWrap = document.createElement('div');
      dayWrap.className = 'log-day';
      const head = document.createElement('div');
      head.className = 'log-day-head';
      head.textContent = iso === today ? 'Today'
        : iso === shiftISO(today, -1) ? 'Yesterday'
        : new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' });
      dayWrap.appendChild(head);
      items.forEach(it => {
        const r = document.createElement('div');
        r.className = 'log-item';
        r.innerHTML = `
          <svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 12 10 18 20 6"/>
          </svg>
          <span class="ltext"></span>
          <span class="ltime">${fmtTime(it.ts)}</span>
        `;
        r.querySelector('.ltext').textContent = it.text;
        if (it.note) {
          const n = document.createElement('span');
          n.className = 'lnote';
          n.textContent = it.note;
          r.querySelector('.ltext').appendChild(n);
        }
        dayWrap.appendChild(r);
      });
      logList.appendChild(dayWrap);
    });
  }

  function renderReleased() {
    releasedList.innerHTML = '';
    const today = todayISO();
    const days7 = last7Days().reverse();
    days7.forEach(({ iso }) => {
      const items = state.released[iso] || [];
      if (!items.length) return;
      const dayWrap = document.createElement('div');
      dayWrap.className = 'log-day';
      const head = document.createElement('div');
      head.className = 'log-day-head';
      head.textContent = iso === today ? 'Today'
        : iso === shiftISO(today, -1) ? 'Yesterday'
        : new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' });
      dayWrap.appendChild(head);
      items.forEach(it => {
        const r = document.createElement('div');
        r.className = 'released-item';
        r.innerHTML = `<span class="ltext"></span><span class="ltime">${fmtTime(it.ts)}</span>`;
        r.querySelector('.ltext').textContent = it.text;
        dayWrap.appendChild(r);
      });
      releasedList.appendChild(dayWrap);
    });
  }

  function promote(stackIdx) {
    const item = state.stack[stackIdx];
    if (!item) return;
    state.stack.splice(stackIdx, 1);
    if (state.current && state.current.trim()) state.stack.push(state.current);
    state.current = item;
    state.timerStart = Date.now();
    // Promoting a different task — its note belongs to the previous one (already discarded)
    state.currentNote = '';
    save(); renderThing(); renderCounter(); renderDrawer(); renderAside();
    closeDrawer();
  }

  function addToStack(text) {
    const t = text.trim();
    if (!t) return;
    let promotedToCurrent = false;
    if (!state.current) {
      state.current = t;
      state.timerStart = Date.now();
      promotedToCurrent = true;
    } else {
      state.stack.push(t);
    }
    save(); renderThing(); renderCounter(); renderDrawer(); renderAside();
    if (motionOn) {
      if (promotedToCurrent) {
        // The text just landed in the card — pop the thing.
        mAnimate(thingEl,
          { opacity: [0, 1], y: [10, 0], filter: ['blur(4px)', 'blur(0px)'] },
          { duration: 0.5, ease });
      } else {
        // Highlight the newly added row at the top of the (reversed) list.
        const first = drawerList.querySelector('.stack-item');
        if (first) {
          mAnimate(first,
            { opacity: [0, 1], y: [-12, 0], scale: [0.96, 1] },
            { type: 'spring', stiffness: 360, damping: 24 });
        }
      }
    }
  }
  addBtn.addEventListener('click', () => { addToStack(addInput.value); addInput.value=''; addInput.focus(); });
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { addToStack(addInput.value); addInput.value=''; }
  });

  /** ---------- Off the plate ---------- */
  const affirmWords = ['released', 'cleansed', 'let go', 'space made', "not yours to carry"];
  let affirmTimer = null;

  function flashAffirm() {
    const word = affirmWords[Math.floor(Math.random() * affirmWords.length)];
    affirmEl.textContent = word;
    if (affirmTimer) clearTimeout(affirmTimer);
    affirmEl.classList.add('show');
    if (motionOn) {
      // Soft spring up + slight blur clear, then sigh back down.
      mAnimate(affirmEl,
        { opacity: [0, 1], y: [10, 0], filter: ['blur(3px)', 'blur(0px)'] },
        { type: 'spring', stiffness: 240, damping: 26 });
    }
    affirmTimer = setTimeout(() => {
      if (motionOn) {
        mAnimate(affirmEl,
          { opacity: [1, 0], y: [0, -6], filter: ['blur(0px)', 'blur(2px)'] },
          { duration: 0.5, ease })
          .finished.then(() => affirmEl.classList.remove('show'))
          .catch(() => affirmEl.classList.remove('show'));
      } else {
        affirmEl.classList.remove('show');
      }
    }, 1100);
  }

  function logReleased(text) {
    const t = (text || '').trim();
    if (!t) return;
    const today = todayISO();
    if (!state.released[today]) state.released[today] = [];
    state.released[today].push({ text: t, ts: Date.now() });
    save();
    flashAffirm();
  }

  /** ---------- Done / Completion ---------- */
  function complete() {
    if (!state.current) return;
    const text = state.current;
    const today = todayISO();
    if (!state.log[today]) state.log[today] = [];
    const entry = { text, ts: Date.now() };
    const note = (state.currentNote || '').trim();
    if (note) entry.note = note;
    state.log[today].push(entry);
    // Clear the note — it's now committed to the log
    state.currentNote = '';
    if (asidePanel.classList.contains('open')) closeAside();

    // Run gentle completion overlay
    runCompletion();
    playChime();

    // Pull next from stack (or empty) WITHOUT animating the card itself —
    // we crossfade the text to avoid jank. Motion adds a slight blur dust
    // to the swap so it feels less like a flicker.
    setTimeout(() => {
      const next = state.stack.length ? state.stack.pop() : '';
      const swap = () => {
        state.current = next;
        state.timerStart = next ? Date.now() : null;
        save();
        renderThing();
        renderAside();
      };
      if (motionOn) {
        mAnimate(thingEl,
          { opacity: [1, 0], filter: ['blur(0px)', 'blur(4px)'], y: [0, -4] },
          { duration: 0.28, ease })
          .finished.then(() => {
            swap();
            mAnimate(thingEl,
              { opacity: [0, 1], filter: ['blur(4px)', 'blur(0px)'], y: [4, 0] },
              { duration: 0.35, ease });
          }).catch(swap);
      } else {
        thingEl.style.transition = 'opacity 0.3s ease';
        thingEl.style.opacity = '0';
        setTimeout(() => {
          swap();
          thingEl.style.opacity = '1';
          setTimeout(() => { thingEl.style.transition = ''; }, 350);
        }, 300);
      }
      renderCounter();
      renderStreak();
    }, 600);
  }
  doneBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (editing) commitEdit();
    else if (state.current) complete();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (document.activeElement !== thingEl && document.activeElement !== addInput) {
        e.preventDefault();
        if (state.current) complete();
      }
    }
  });

  function runCompletion() {
    motes.innerHTML = '';
    const colors = ['#fbc768', '#47d096', '#e2ddfd', '#ffd7f0', '#c6ece9'];
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const count = motionOn ? 22 : 14;
    const moteEls = [];
    for (let i = 0; i < count; i++) {
      const m = document.createElement('div');
      m.className = 'mote motion-rendered';
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const dist = 90 + Math.random() * 110;
      m.dataset.dx = String(Math.cos(angle) * dist);
      m.dataset.dy = String(Math.sin(angle) * dist - 40);
      m.style.setProperty('--dx', `${m.dataset.dx}px`);
      m.style.setProperty('--dy', `${m.dataset.dy}px`);
      m.style.left = `${cx}px`;
      m.style.top = `${cy}px`;
      m.style.background = colors[i % colors.length];
      m.style.animationDelay = `${Math.random() * 100}ms`;
      motes.appendChild(m);
      moteEls.push(m);
    }
    completeOverlay.classList.add('show');

    if (motionOn) {
      // Each mote arcs outward with a slight gravity-like settle.
      moteEls.forEach((m, i) => {
        const dx = parseFloat(m.dataset.dx);
        const dy = parseFloat(m.dataset.dy);
        mAnimate(m,
          {
            opacity: [0, 0.95, 0],
            x: [0, dx * 0.6, dx],
            y: [0, dy * 0.5, dy + 28],
            scale: [0.4, 1, 1.15]
          },
          {
            duration: 1.5 + Math.random() * 0.3,
            delay: Math.random() * 0.18,
            ease: [0.18, 0.6, 0.3, 1],
            times: [0, 0.4, 1]
          });
      });

      // The check mark itself: spring in, hang, soft fade.
      const mark = completeOverlay.querySelector('.complete-mark');
      mAnimate(mark, { scale: [0.4, 1.08, 1], opacity: [0, 1, 1] },
        { duration: 0.6, ease: 'easeOut', times: [0, 0.7, 1] });
      mAnimate(mark, { scale: 0.9, opacity: 0 },
        { duration: 0.5, delay: 1.1, ease });

      // Draw the check polyline.
      const poly = mark.querySelector('polyline');
      const len = (poly.getTotalLength && poly.getTotalLength()) || 28;
      poly.style.strokeDasharray = String(len);
      poly.style.strokeDashoffset = String(len);
      mAnimate(poly, { strokeDashoffset: [len, 0] },
        { duration: 0.45, delay: 0.18, ease: 'easeOut' });
    }

    setTimeout(() => completeOverlay.classList.remove('show'), 1700);
  }

  /** ---------- Sound ---------- */
  let audioCtx = null;
  function playChime() {
    if (!state.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      [523.25, 783.99].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0, now + i * 0.08);
        g.gain.linearRampToValueAtTime(0.06, now + i * 0.08 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.6);
        o.connect(g).connect(audioCtx.destination);
        o.start(now + i * 0.08);
        o.stop(now + i * 0.08 + 0.65);
      });
    } catch (e) {}
  }

  /** ---------- Popover ---------- */
  function openPopover() {
    popoverEl.classList.add('open');
    if (motionOn) {
      mAnimate(popoverEl,
        { opacity: [0, 1], scale: [0.92, 1], y: [8, 0] },
        { type: 'spring', stiffness: 360, damping: 26 });
      const rows = popoverEl.querySelectorAll('.pop-title, .pop-row, .pop-divider');
      mAnimate(rows, { opacity: [0, 1], y: [6, 0] },
        { duration: 0.4, delay: mStagger(0.025, { start: 0.05 }), ease });
    }
  }
  function closePopover() {
    if (motionOn) {
      mAnimate(popoverEl,
        { opacity: [1, 0], scale: [1, 0.96], y: [0, 6] },
        { duration: 0.18, ease })
        .finished.then(() => popoverEl.classList.remove('open'))
        .catch(() => popoverEl.classList.remove('open'));
    } else {
      popoverEl.classList.remove('open');
    }
  }
  gearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popoverEl.classList.contains('open') ? closePopover() : openPopover();
  });
  document.addEventListener('click', (e) => {
    if (!popoverEl.contains(e.target) && !gearBtn.contains(e.target)) closePopover();
  });
  swatchesEl.querySelectorAll('.swatch').forEach(s => {
    s.addEventListener('click', () => { state.moodOverride = s.dataset.mood; save(); applyMood(); });
  });
  function renderSound() { soundState.textContent = state.sound ? 'On' : 'Off'; }
  soundRow.addEventListener('click', () => { state.sound = !state.sound; save(); renderSound(); });
  clearRow.addEventListener('click', () => {
    if (!confirm('Clear the thing, the queue, the log, and stats?')) return;
    state = { ...defaultState, onboarded: true };
    save(); renderAll(); closePopover();
  });
  logRow.addEventListener('click', () => { closePopover(); openDrawer('log'); });
  manifestoRow.addEventListener('click', () => { closePopover(); openManifesto(); });

  /** ---------- Backup / Restore ---------- */
  function exportState() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `onething-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    closePopover();
  }

  function importFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (typeof parsed !== 'object' || parsed === null) throw new Error('shape');
        if (!confirm('Restore from this backup? Your current task, queue, and log will be replaced.')) return;
        state = { ...defaultState, ...parsed };
        save();
        renderAll();
        closePopover();
      } catch (e) {
        alert("Couldn't read that file. It needs to be a backup from this app.");
      }
    };
    reader.readAsText(file);
  }

  exportRow.addEventListener('click', exportState);
  importRow.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importFromFile(f);
    importFile.value = '';
  });

  function openManifesto() {
    manifestoEl.classList.add('open');
    if (motionOn) {
      mAnimate(manifestoEl, { opacity: [0, 1] }, { duration: 0.3, ease });
      const inner = manifestoEl.querySelector('.manifesto-inner');
      mAnimate(inner,
        { opacity: [0, 1], scale: [0.96, 1], y: [12, 0] },
        { type: 'spring', stiffness: 280, damping: 28 });
      const parts = manifestoEl.querySelectorAll(
        '.manifesto h1, .manifesto p, .manifesto .signoff');
      mAnimate(parts, { opacity: [0, 1], y: [10, 0] },
        { duration: 0.5, delay: mStagger(0.07, { start: 0.18 }), ease });
    }
  }
  function closeManifesto() {
    if (motionOn) {
      mAnimate(manifestoEl, { opacity: [1, 0] }, { duration: 0.22, ease })
        .finished.then(() => manifestoEl.classList.remove('open'))
        .catch(() => manifestoEl.classList.remove('open'));
    } else {
      manifestoEl.classList.remove('open');
    }
  }
  manifestoClose.addEventListener('click', closeManifesto);
  manifestoEl.addEventListener('click', (e) => { if (e.target === manifestoEl) closeManifesto(); });

  /** ---------- Aside (a note to self) ---------- */
  const asidePrompts = [
    "type through it. nobody's watching.",
    "what's coming up?",
    "what wants to be expressed?",
    "what's underneath?",
    "where's the resistance?",
    "say the quiet part.",
    "what would you write if no one read it?",
  ];
  let asideSaveTimer = null;

  let prevHasNote = false;
  function renderAside() {
    // Tab visibility: only when there's a current task
    const hasCurrent = !!(state.current && state.current.trim());
    const wasHidden = asideTab.hidden;
    asideTab.hidden = !hasCurrent;
    const hasNote = !!(state.currentNote && state.currentNote.trim());
    asideTab.classList.toggle('has-note', hasNote);
    // Reflect saved value into textarea when not actively editing
    if (document.activeElement !== asideText) {
      asideText.value = state.currentNote || '';
    }
    if (motionOn) {
      // Tab becomes visible — slide in from the card's right edge.
      if (wasHidden && hasCurrent) {
        mAnimate(asideTab, { opacity: [0, 1], x: [-8, 0] },
          { type: 'spring', stiffness: 320, damping: 26 });
      }
      // Note dot just turned on — small celebratory bump.
      if (!prevHasNote && hasNote) {
        const dot = asideTab.querySelector('.aside-tab-dot');
        if (dot) mAnimate(dot, { scale: [0.5, 1.6, 1] },
          { duration: 0.55, ease: 'easeOut' });
      }
    }
    prevHasNote = hasNote;
  }

  function openAside() {
    if (!state.current || !state.current.trim()) return;
    if (editing) commitEdit();
    asideText.placeholder = asidePrompts[Math.floor(Math.random() * asidePrompts.length)];
    asideText.value = state.currentNote || '';
    asidePanel.classList.add('open');
    asideScrim.classList.add('open');
    asidePanel.setAttribute('aria-hidden', 'false');
    if (motionOn) {
      mAnimate(asideScrim, { opacity: [0, 1] }, { duration: 0.25, ease });
      mAnimate(asidePanel,
        { opacity: [0, 1], x: [24, 0] },
        { type: 'spring', stiffness: 320, damping: 28 });
    }
    setTimeout(() => asideText.focus(), 80);
  }

  function closeAside() {
    flushAsideSave();
    asidePanel.setAttribute('aria-hidden', 'true');
    if (motionOn) {
      mAnimate(asideScrim, { opacity: [1, 0] }, { duration: 0.22, ease })
        .finished.then(() => asideScrim.classList.remove('open'))
        .catch(() => asideScrim.classList.remove('open'));
      mAnimate(asidePanel,
        { opacity: [1, 0], x: [0, 18] },
        { duration: 0.26, ease })
        .finished.then(() => { asidePanel.classList.remove('open'); renderAside(); })
        .catch(() => { asidePanel.classList.remove('open'); renderAside(); });
    } else {
      asidePanel.classList.remove('open');
      asideScrim.classList.remove('open');
      renderAside();
    }
  }

  function flushAsideSave() {
    if (asideSaveTimer) { clearTimeout(asideSaveTimer); asideSaveTimer = null; }
    const v = asideText.value;
    if ((state.currentNote || '') !== v) {
      state.currentNote = v;
      save();
    }
  }

  function scheduleAsideSave() {
    if (asideSaveTimer) clearTimeout(asideSaveTimer);
    asideSaveTimer = setTimeout(flushAsideSave, 250);
  }

  asideTab.addEventListener('click', (e) => { e.stopPropagation(); openAside(); });
  asideTab.addEventListener('mousedown', (e) => { e.stopPropagation(); });
  asideClose.addEventListener('click', closeAside);
  asideScrim.addEventListener('click', closeAside);
  asideText.addEventListener('input', scheduleAsideSave);
  asideText.addEventListener('blur', flushAsideSave);
  asideText.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeAside(); }
  });
  window.addEventListener('beforeunload', flushAsideSave);
  // Esc anywhere closes the panel (slot into existing handler chain via separate listener)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && asidePanel.classList.contains('open')) {
      // Only handle if the textarea isn't focused (its own handler will fire first)
      if (document.activeElement !== asideText) closeAside();
    }
  });

  /** ---------- Greeting ---------- */
  function maybeShowGreeting() {
    const today = todayISO();
    const yesterday = shiftISO(today, -1);
    const yest = state.log[yesterday] || [];
    const lastSeen = state.lastSeen;
    state.lastSeen = today;
    save();
    if (!yest.length) return;
    if (lastSeen === today) return; // already opened today
    // Hide card, show greeting
    cardWrap.classList.add('hidden');
    const word = yest.length === 1 ? 'one thing' : `${yest.length} things`;
    const phrase = `Yesterday you did ${word}.`;
    if (motionOn) {
      // Split into words so each lifts in with stagger.
      const wordSpans = phrase.split(' ').map(w =>
        `<span class="g-word" style="display:inline-block;white-space:pre;">${w} </span>`
      ).join('');
      greetingEl.innerHTML = `${wordSpans}<span class="sub">Today's a fresh page.</span>`;
      greetingEl.classList.add('show');
      greetingEl.style.opacity = '1';
      mAnimate(greetingEl.querySelectorAll('.g-word'),
        { opacity: [0, 1], y: [14, 0], filter: ['blur(6px)', 'blur(0px)'] },
        { duration: 0.7, delay: mStagger(0.07, { start: 0.15 }), ease });
      mAnimate(greetingEl.querySelector('.sub'),
        { opacity: [0, 1], y: [8, 0] },
        { duration: 0.6, delay: 0.9, ease });
    } else {
      greetingEl.innerHTML = `Yesterday you did ${word}.<span class="sub">Today's a fresh page.</span>`;
      setTimeout(() => greetingEl.classList.add('show'), 200);
    }
    setTimeout(() => {
      if (motionOn) {
        mAnimate(greetingEl,
          { opacity: [1, 0], y: [0, -8], filter: ['blur(0px)', 'blur(4px)'] },
          { duration: 0.6, ease });
      } else {
        greetingEl.classList.remove('show');
      }
    }, 3200);
    setTimeout(() => {
      greetingEl.style.display = 'none';
      cardWrap.classList.remove('hidden');
      if (motionOn) {
        mAnimate(cardEl,
          { opacity: [0, 1], scale: [0.96, 1], y: [16, 0] },
          { type: 'spring', stiffness: 240, damping: 26 });
      } else {
        cardEl.classList.add('entering');
        setTimeout(() => cardEl.classList.remove('entering'), 800);
      }
    }, 3700);
  }

  /** ---------- Onboarding ---------- */
  const onboardEl = el('onboard');
  const obInput = el('ob-input');
  const obStart = el('ob-start');
  const obSkip = el('ob-skip');
  const obProgress = el('ob-progress');

  function showStep(n) {
    document.querySelectorAll('.onboard-step').forEach(s => {
      const num = Number(s.dataset.step);
      s.classList.remove('active', 'exit');
      if (num === n) s.classList.add('active');
      else if (num < n) s.classList.add('exit');
    });
    obProgress.querySelectorAll('span').forEach((d, i) => {
      d.classList.toggle('active', i < n);
    });
    if (motionOn) {
      const activeStep = document.querySelector('.onboard-step.active');
      if (activeStep) {
        const items = activeStep.querySelectorAll('.ob-sub, h2, .ob-input, .ob-cta');
        mAnimate(items,
          { opacity: [0, 1], y: [18, 0], filter: ['blur(6px)', 'blur(0px)'] },
          { duration: 0.7, delay: mStagger(0.09, { start: 0.1 }), ease });
      }
      // Pulse the newly-active progress dot.
      const newDot = obProgress.querySelectorAll('span')[n - 1];
      if (newDot) mAnimate(newDot, { scale: [1, 1.6, 1] },
        { duration: 0.5, ease: 'easeOut' });
    }
  }
  function startOnboarding() {
    onboardEl.hidden = false;
    showStep(1);
  }
  function finishOnboarding(initialThing) {
    state.onboarded = true;
    if (initialThing) {
      state.current = initialThing;
      state.timerStart = Date.now();
    }
    save();
    onboardEl.classList.add('fade');
    setTimeout(() => {
      onboardEl.hidden = true;
      onboardEl.classList.remove('fade');
      renderThing();
      if (motionOn) {
        mAnimate(cardEl,
          { opacity: [0, 1], scale: [0.94, 1], y: [24, 0] },
          { type: 'spring', stiffness: 220, damping: 24 });
        mAnimate(cardWrap.querySelector('.label'),
          { opacity: [0, 1], y: [-6, 0] },
          { duration: 0.6, delay: 0.15, ease });
      } else {
        cardEl.classList.add('entering');
        setTimeout(() => cardEl.classList.remove('entering'), 800);
      }
    }, 700);
  }
  document.querySelectorAll('[data-next]').forEach(b => {
    b.addEventListener('click', () => {
      const next = Number(b.dataset.next);
      showStep(next);
      if (next === 2) setTimeout(() => obInput.focus(), 500);
    });
  });
  obInput.addEventListener('input', () => { obStart.disabled = !obInput.value.trim(); });
  obInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && obInput.value.trim()) {
      e.preventDefault(); obStart.click();
    }
  });
  obStart.addEventListener('click', () => {
    const v = obInput.value.trim();
    if (!v) return;
    showStep(3);
    setTimeout(() => finishOnboarding(v), 1400);
  });
  obSkip.addEventListener('click', () => finishOnboarding(''));

  /** ---------- Init ---------- */
  function renderAll() {
    renderThing();
    renderCounter();
    renderStreak();
    renderSound();
    applyMood();
    tickTimer();
    renderAside();
    updateDocTitle();
  }

  if (!state.onboarded) {
    startOnboarding();
    // Render base state behind, so onboarding fade reveals it
    renderAll();
  } else {
    renderAll();
    // If the greeting will play, it handles its own entrance.
    // Otherwise spring the card + status pill + counter in on first paint.
    const greetingWillPlay = (() => {
      const t = todayISO();
      const yest = state.log[shiftISO(t, -1)] || [];
      return yest.length && state.lastSeen !== t;
    })();
    if (motionOn && !greetingWillPlay) {
      mAnimate(cardEl,
        { opacity: [0, 1], scale: [0.96, 1], y: [16, 0] },
        { type: 'spring', stiffness: 240, damping: 26 });
      mAnimate(cardWrap.querySelector('.label'),
        { opacity: [0, 1], y: [-6, 0] },
        { duration: 0.6, delay: 0.15, ease });
      mAnimate('.status .pill', { opacity: [0, 1], y: [-8, 0] },
        { duration: 0.5, delay: 0.25, ease });
      mAnimate('.counter, .gear-wrap', { opacity: [0, null], y: [12, 0] },
        { duration: 0.5, delay: mStagger(0.08, { start: 0.35 }), ease });
    }
    maybeShowGreeting();
  }
  setInterval(applyMood, 60000);

  // Expose for tweaks
  window.__onething = {
    setCounterStyle(v) { state.counterStyle = v; save(); renderCounter(); },
    getState() { return state; },
    showOnboarding() { state.onboarded = false; save(); location.reload(); }
  };
})();
