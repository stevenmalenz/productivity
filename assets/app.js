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

  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function shiftISO(iso, days) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
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
  const todLabel = el('tod-label');
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
  const asideTask = el('aside-task');
  const asideSub = el('aside-sub');
  const asideClose = el('aside-close');

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
    todLabel.textContent = m.label;
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
      setHint(editing
        ? '<kbd>⏎</kbd> save · <kbd>esc</kbd> cancel'
        : 'Click text to edit · <kbd>⌘⏎</kbd> mark done');
    }
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
    setHint('<kbd>⏎</kbd> save · <kbd>esc</kbd> cancel');
  }

  function commitEdit() {
    if (!editing) return;
    const v = thingEl.textContent.trim();
    if (v && v !== state.current) {
      // New / changed thing — start timer fresh
      state.current = v;
      state.timerStart = Date.now();
    } else if (!v) {
      state.current = '';
      state.timerStart = null;
      // No task means no aside note
      state.currentNote = '';
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
  function tickTimer() {
    timerEl.textContent = (state.current && state.timerStart)
      ? fmt(Date.now() - state.timerStart) : '00:00';
  }
  setInterval(tickTimer, 1000);

  /** ---------- Streak / log render ---------- */
  function renderStreak() {
    const todayCount = (state.log[todayISO()] || []).length;
    streakLabel.textContent = todayCount === 1 ? '1 done today' : `${todayCount} done today`;
    const days = computeStreak();
    streakCountEl.textContent = days;

    // Ring around gear: progress = consecutive days in last 7
    const days7 = last7Days();
    const filled = days7.filter(d => d.count > 0).length;
    const C = 2 * Math.PI * 24;
    const fg = gearRing.querySelector('circle.fg');
    fg.setAttribute('stroke-dasharray', String(C));
    fg.setAttribute('stroke-dashoffset', String(C * (1 - filled / 7)));
    gearRing.classList.toggle('dim', filled === 0);

    streakDays.innerHTML = days7.map(d =>
      `<span style="width:6px;height:6px;border-radius:50%;background:${d.count>0?'var(--color-engagement-gold)':'rgba(17,17,17,0.12)'};display:inline-block;"></span>`
    ).join('');

    logCount.textContent = todayCount === 0 ? '—' : `${todayCount} done`;
  }

  /** ---------- Counter ---------- */
  function renderCounter() {
    countNum.textContent = state.stack.length;
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
    setTimeout(() => activeTab === 'queue' && addInput.focus(), 200);
  }
  function closeDrawer() { drawer.classList.remove('open'); scrim.classList.remove('open'); }
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
      drawerTitle.textContent = 'In the wings';
      drawerSub.textContent = 'Drag to reorder. Click to make it the one.';
      renderDrawer();
    } else {
      queuePane.style.display = 'none';
      logList.style.display = '';
      drawerTitle.textContent = "Today's log";
      drawerSub.textContent = 'Calm proof you showed up.';
      renderLog();
    }
  }
  document.querySelectorAll('.drawer-tab').forEach(t => {
    t.addEventListener('click', () => setTab(t.dataset.tab));
  });

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
        state.stack.splice(stackIdx, 1);
        save(); renderDrawer(); renderCounter();
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
        const t = new Date(it.ts);
        const hh = String(t.getHours()).padStart(2,'0');
        const mm = String(t.getMinutes()).padStart(2,'0');
        r.innerHTML = `
          <svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 12 10 18 20 6"/>
          </svg>
          <span class="ltext"></span>
          <span class="ltime">${hh}:${mm}</span>
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
    if (!state.current) {
      state.current = t;
      state.timerStart = Date.now();
    } else {
      state.stack.push(t);
    }
    save(); renderThing(); renderCounter(); renderDrawer(); renderAside();
  }
  addBtn.addEventListener('click', () => { addToStack(addInput.value); addInput.value=''; addInput.focus(); });
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { addToStack(addInput.value); addInput.value=''; }
  });

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
    // we crossfade the text to avoid jank.
    setTimeout(() => {
      const next = state.stack.length ? state.stack.pop() : '';
      // Crossfade text
      thingEl.style.transition = 'opacity 0.3s ease';
      thingEl.style.opacity = '0';
      setTimeout(() => {
        state.current = next;
        state.timerStart = next ? Date.now() : null;
        save();
        renderThing();
        renderAside();
        thingEl.style.opacity = '1';
        setTimeout(() => { thingEl.style.transition = ''; }, 350);
      }, 300);
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
    for (let i = 0; i < 14; i++) {
      const m = document.createElement('div');
      m.className = 'mote';
      const angle = (Math.PI * 2 * i) / 14 + (Math.random() - 0.5) * 0.5;
      const dist = 90 + Math.random() * 100;
      m.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      m.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
      m.style.left = `${cx}px`;
      m.style.top = `${cy}px`;
      m.style.background = colors[i % colors.length];
      m.style.animationDelay = `${Math.random() * 100}ms`;
      motes.appendChild(m);
    }
    completeOverlay.classList.add('show');
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
  function openPopover() { popoverEl.classList.add('open'); }
  function closePopover() { popoverEl.classList.remove('open'); }
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

  function openManifesto() { manifestoEl.classList.add('open'); }
  function closeManifesto() { manifestoEl.classList.remove('open'); }
  manifestoClose.addEventListener('click', closeManifesto);
  manifestoEl.addEventListener('click', (e) => { if (e.target === manifestoEl) closeManifesto(); });

  /** ---------- Aside (a note to self) ---------- */
  const asidePrompts = [
    "type through it. nobody's watching.",
    "what's coming up?",
    "what are you scared to do?",
    "say the quiet part.",
    "what would you write if no one read it?",
  ];
  let asideSaveTimer = null;

  function renderAside() {
    // Tab visibility: only when there's a current task
    const hasCurrent = !!(state.current && state.current.trim());
    asideTab.hidden = !hasCurrent;
    asideTab.classList.toggle('has-note', !!(state.currentNote && state.currentNote.trim()));
    // Echo current task in the panel header
    if (hasCurrent) {
      asideTask.textContent = state.current;
      asideSub.classList.remove('empty');
    } else {
      asideSub.classList.add('empty');
    }
    // Reflect saved value into textarea when not actively editing
    if (document.activeElement !== asideText) {
      asideText.value = state.currentNote || '';
    }
  }

  function openAside() {
    if (!state.current || !state.current.trim()) return;
    if (editing) commitEdit();
    asideText.placeholder = asidePrompts[Math.floor(Math.random() * asidePrompts.length)];
    asideText.value = state.currentNote || '';
    asidePanel.classList.add('open');
    asideScrim.classList.add('open');
    asidePanel.setAttribute('aria-hidden', 'false');
    cardEl.classList.add('aside-open');
    setTimeout(() => asideText.focus(), 80);
  }

  function closeAside() {
    flushAsideSave();
    asidePanel.classList.remove('open');
    asideScrim.classList.remove('open');
    asidePanel.setAttribute('aria-hidden', 'true');
    cardEl.classList.remove('aside-open');
    renderAside();
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
    greetingEl.innerHTML = `Yesterday you did ${word}.<span class="sub">Today's a fresh page.</span>`;
    setTimeout(() => greetingEl.classList.add('show'), 200);
    setTimeout(() => greetingEl.classList.remove('show'), 3200);
    setTimeout(() => {
      greetingEl.style.display = 'none';
      cardWrap.classList.remove('hidden');
      cardEl.classList.add('entering');
      setTimeout(() => cardEl.classList.remove('entering'), 800);
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
      cardEl.classList.add('entering');
      setTimeout(() => cardEl.classList.remove('entering'), 800);
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
  }

  if (!state.onboarded) {
    startOnboarding();
    // Render base state behind, so onboarding fade reveals it
    renderAll();
  } else {
    renderAll();
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
