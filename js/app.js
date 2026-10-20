/* Dorm Points: main page. */
(function () {
  'use strict';

  const cfg = window.DORM_CONFIG || {};
  const core = window.DormCore;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const MY_NAME_KEY = 'dormPoints.myName';
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
  const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const ANON = 'Anonymous';
  const LOG_PAGE = 40;

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* private mode */ } },
  };
  store.remove('dormPoints.myId'); // older versions remembered the student ID here

  let ranked = [];
  let byKey = new Map();
  let log = [];
  let arena = null;
  let pinned = false; // card opened by a click (stays) rather than by hovering
  let logShown = LOG_PAGE;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function pts(n) { return Math.abs(n) === 1 ? 'point' : 'points'; }
  function showPoints(n) { return (n < 0 ? '−' : '') + Math.abs(n); }
  function signed(n) { return (n < 0 ? '−' : '+') + Math.abs(n); }
  function rankBadge(s) { return s.points > 0 && MEDALS[s.rank] ? MEDALS[s.rank] : `<b>${ordinal(s.rank)}</b>`; }
  function formatDate(iso, opts) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? new Date(iso + 'T12:00:00') : new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function shortDate(iso) { return formatDate(iso, { day: 'numeric', month: 'short' }); }

  const categoryIcons = new Map();
  [].concat(cfg.earn || [], cfg.lose || []).forEach(i => categoryIcons.set(i.title.toLowerCase(), i.icon));
  function iconFor(e) {
    return categoryIcons.get(String(e.category).toLowerCase()) ||
      (/start/i.test(e.category) ? '🏁' : e.points < 0 ? '⚠️' : '✨');
  }
  function entryText(e) { return e.reason || e.category; }

  // ------------------------------------------------------------------ static content

  function renderRules() {
    const rule = (item, kind) =>
      `<li class="rule rule-${kind}"><span class="rule-icon" aria-hidden="true">${item.icon}</span>` +
      `<div><h4>${esc(item.title)}</h4><p>${esc(item.text)}</p></div>` +
      `<span class="rule-pts">${esc(item.points)}</span></li>`;
    $('#earn-list').innerHTML = (cfg.earn || []).map(i => rule(i, 'plus')).join('');
    $('#lose-list').innerHTML = (cfg.lose || []).map(i => rule(i, 'minus')).join('');
    $('#why-list').innerHTML = (cfg.whyItMatters || [])
      .map(i => `<li><span aria-hidden="true">${i.icon}</span>${esc(i.text)}</li>`).join('');
    $('#req-activity').innerHTML = (cfg.earn || [])
      .map(i => `<option>${esc(i.title)}</option>`).join('');
  }

  // ------------------------------------------------------------------ leaderboard

  function renderStats(data) {
    const total = ranked.reduce((sum, s) => sum + s.points, 0);
    const updated = formatDate(data.updated);
    $('#stats').innerHTML =
      `<li><span aria-hidden="true">👥</span><b>${ranked.length}</b> students</li>` +
      `<li><span aria-hidden="true">⭐</span><b>${showPoints(total)}</b> dorm points</li>` +
      `<li><span aria-hidden="true">📜</span><b>${log.length}</b> log entries</li>` +
      (updated ? `<li><span aria-hidden="true">🗓️</span>Updated <b>${esc(updated)}</b></li>` : '');
    $('#footer-updated').textContent = updated ? `Points updated ${updated}` : '';
  }

  function entriesNote(s) {
    const n = s.entries.length;
    return n ? `${n} log entr${n === 1 ? 'y' : 'ies'}` : 'No entries yet';
  }

  function nameHtml(s) {
    return s.label ? esc(s.label) : `<span class="anon">${ANON}</span>`;
  }

  function renderTop() {
    const top = ranked.filter(s => s.rank <= 5 && s.points > 0);
    const shown = top.slice(0, 10);
    const list = $('#top-list');
    if (!shown.length) {
      list.innerHTML = '<li class="empty">No points yet. Be the first! 🌱</li>';
      return;
    }
    list.innerHTML = shown.map(s =>
      `<li class="top-item rank-${Math.min(s.rank, 4)}"><button type="button" data-key="${esc(s.id)}">` +
      `<span class="top-medal">${rankBadge(s)}</span>` +
      `<span class="top-name">${nameHtml(s)}<small>${entriesNote(s)}</small></span>` +
      `<span class="top-pts">${showPoints(s.points)}<small>${pts(s.points)}</small></span>` +
      '</button></li>').join('') +
      (top.length > shown.length ? `<li class="empty">+${top.length - shown.length} more tied</li>` : '');
  }

  function renderEveryone() {
    $('#everyone').innerHTML = ranked.map(s =>
      `<li data-search="${esc((s.label || ANON).toLowerCase())}"><button type="button" data-key="${esc(s.id)}">` +
      `<span class="ev-rank">${s.rank}</span><span class="ev-name">${nameHtml(s)}<small>${entriesNote(s)}</small></span>` +
      `<span class="ev-pts${s.points < 0 ? ' is-neg' : ''}">${showPoints(s.points)}</span></button></li>`).join('');
  }

  function filterEveryone(query) {
    const q = query.trim().toLowerCase();
    let shown = 0;
    for (const li of $('#everyone').children) {
      const match = !q || li.dataset.search.includes(q);
      li.hidden = !match;
      if (match) shown++;
    }
    $('#everyone').classList.toggle('is-empty', shown === 0);
  }

  function jumpToBubble(key) {
    if (!arena || !byKey.has(key)) return;
    pinned = true;
    arena.select(key, { scroll: true });
  }

  // ------------------------------------------------------------------ bubble card

  function cardLog(s) {
    if (!s.entries.length) return '<p class="card-note card-empty">No points logged yet.</p>';
    return '<ul class="card-log">' + s.entries.map(e =>
      `<li><span class="cl-icon" aria-hidden="true">${iconFor(e)}</span>` +
      `<span class="cl-text">${esc(entryText(e))}<small>${esc([e.reason ? e.category : '', shortDate(e.date)].filter(Boolean).join(' · '))}</small></span>` +
      `<span class="cl-pts ${e.points < 0 ? 'is-neg' : ''}">${signed(e.points)}</span></li>`).join('') + '</ul>';
  }

  function showCard(s, pos) {
    const card = $('#bubble-card');
    if (!s) { card.hidden = true; pinned = false; return; }
    const higher = ranked.filter(x => x.points > s.points);
    const next = higher[higher.length - 1];
    const tied = ranked.filter(x => x.points === s.points).length - 1;
    let note;
    if (!next) note = tied ? 'Sharing the top spot! 🏆' : 'Top of the dorm! 🏆';
    else note = `${next.points - s.points} more ${pts(next.points - s.points)} to catch up with ${ordinal(next.rank)} place`;
    const isMe = s.label && s.label.toLowerCase() === (store.get(MY_NAME_KEY) || '').toLowerCase();
    const title = s.label || ANON;
    card.innerHTML =
      '<button type="button" class="card-close" aria-label="Close">×</button>' +
      `<div class="card-rank">${rankBadge(s)}</div>` +
      `<h3 style="font-size: ${title.length > 13 ? 18 : title.length > 9 ? 21 : 24}px">${esc(title)}${isMe ? ' <span class="card-you">you!</span>' : ''}</h3>` +
      `<p class="card-points"><b>${showPoints(s.points)}</b> ${pts(s.points)}</p>` +
      `<p class="card-note">${esc(ordinal(s.rank))} of ${ranked.length}${tied ? ` · tied with ${tied} other${tied > 1 ? 's' : ''}` : ''}</p>` +
      `<p class="card-note">${esc(note)}</p>` +
      `<h4 class="card-log-title">How they got their points</h4>${cardLog(s)}`;
    card.hidden = false;
    // Place it above the bubble, or below when there's no room, or beside it.
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const x = Math.min(Math.max(pos.x - w / 2, 8), pos.width - w - 8);
    let y = pos.y - pos.r - h - 14;
    if (y < 8) y = pos.y + pos.r + 14;
    if (y + h > pos.height - 8) y = Math.max(8, pos.height - h - 8);
    card.style.left = Math.max(8, x) + 'px';
    card.style.top = Math.max(8, y) + 'px';
  }

  function onBubbleClick(key) {
    if (!key) return;
    if (pinned && arena.selected && arena.selected.s.id === key) { arena.select(null); return; }
    arena.select(key);
    pinned = true;
  }

  /** On computers, hovering a bubble shows its card; clicking keeps it open. */
  function setupHover() {
    const el = $('#arena');
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
    el.addEventListener('mouseover', e => {
      if (pinned || !canHover.matches) return;
      const b = e.target.closest('.bubble');
      if (b && (!arena.selected || arena.selected.s.id !== b.dataset.id)) arena.select(b.dataset.id);
    });
    el.addEventListener('mouseout', e => {
      if (pinned || !canHover.matches || !arena.selected) return;
      const to = e.relatedTarget;
      if (to && to.closest && (to.closest('.bubble') || to.closest('.bubble-card'))) return;
      arena.select(null);
    });
  }

  // ------------------------------------------------------------------ find me

  function findMe(raw, opts) {
    const quiet = opts && opts.quiet;
    const q = String(raw || '').trim().toLowerCase();
    const msg = $('#findme-msg');
    msg.classList.remove('is-error');
    if (!q) { msg.textContent = ''; return; }
    const s = ranked.find(x => x.label && x.label.toLowerCase() === q) ||
      ranked.find(x => x.label && x.label.toLowerCase().startsWith(q));
    if (!s) {
      msg.innerHTML = `No bubble called “${esc(raw.trim())}”. If you didn't ask for your name to be shown, your bubble is one of the <b>?</b> ones. Message the admin if you'd like your name on it.`;
      msg.classList.add('is-error');
      return;
    }
    store.set(MY_NAME_KEY, s.label);
    arena.setMe(s.id);
    $('#findme-input').value = s.label;
    const cheer = s.rank === 1 && s.points > 0 ? ' 🏆' : s.points > 0 ? ' 🎉' : ' Let\'s get some points! 💪';
    msg.innerHTML = `Hi <b>${esc(s.label)}</b>! You're <b>${ordinal(s.rank)}</b> of ${ranked.length} with <b>${showPoints(s.points)}</b> ${pts(s.points)}.${cheer}`;
    if (!$('#req-name').value) $('#req-name').value = s.label;
    if (!quiet) jumpToBubble(s.id);
  }

  // ------------------------------------------------------------------ points log board

  function renderLogFilters() {
    const cats = Array.from(new Set(log.map(e => e.category))).sort();
    $('#log-category').innerHTML = '<option value="">All categories</option>' +
      cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }

  function renderLog() {
    const q = $('#log-search').value.trim().toLowerCase();
    const cat = $('#log-category').value;
    const list = log.filter(e => {
      if (cat && e.category !== cat) return false;
      if (!q) return true;
      return [e.student.label || ANON, e.category, e.reason || ''].join(' ').toLowerCase().includes(q);
    });
    const shown = list.slice(0, logShown);
    let html = '';
    let month = null;
    for (const e of shown) {
      const m = e.date ? formatDate(e.date, { month: 'long', year: 'numeric' }) : 'Carried over';
      if (m !== month) { html += `<li class="log-month">${esc(m)}</li>`; month = m; }
      html +=
        `<li class="log-item${e.points < 0 ? ' is-neg' : ''}">` +
        `<span class="log-date">${e.date ? esc(shortDate(e.date)) : '–'}</span>` +
        `<span class="log-icon" aria-hidden="true">${iconFor(e)}</span>` +
        '<span class="log-body">' +
        `<button type="button" class="log-who" data-key="${esc(e.student.id)}">${nameHtml(e.student)}</button>` +
        `<span class="log-what">${esc(entryText(e))}</span>` +
        (e.reason ? `<small>${esc(e.category)}</small>` : '') +
        '</span>' +
        `<span class="log-pts">${signed(e.points)}</span></li>`;
    }
    $('#log-list').innerHTML = html || '<li class="empty">Nothing matches that search.</li>';
    $('#log-count').textContent = list.length === log.length
      ? `${log.length} entries`
      : `${list.length} of ${log.length} entries`;
    $('#log-more').hidden = list.length <= shown.length;
  }

  // ------------------------------------------------------------------ request form

  function formatBytes(n) {
    return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }

  /** Shrinks big phone photos so the email goes through quickly. */
  async function shrinkPhoto(file) {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    if (file.size < 800 * 1024) return file;
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { return file; }
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  }

  function setupRequestForm() {
    const form = $('#request-form');
    const photo = $('#req-photo');
    const dropzone = $('#dropzone');
    const submit = $('#req-submit');
    const error = $('#req-error');
    let preparing = null;
    let previewUrl = null;

    form.action = 'https://formsubmit.co/' + String(cfg.requestEmail || '').trim();

    const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $('#req-date').value = today();

    function showPhoto(file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = file ? URL.createObjectURL(file) : null;
      $('.dropzone-empty', dropzone).hidden = !!file;
      $('.dropzone-full', dropzone).hidden = !file;
      $('#req-photo-remove').hidden = !file;
      dropzone.classList.toggle('has-file', !!file);
      if (file) {
        $('#req-photo-preview').src = previewUrl;
        $('#req-photo-name').textContent = file.name;
        $('#req-photo-size').textContent = formatBytes(file.size);
      }
    }

    async function takePhoto(file) {
      error.textContent = '';
      if (!file) { showPhoto(null); return; }
      if (!file.type.startsWith('image/')) {
        error.textContent = 'Please choose an image file (JPG or PNG).';
        photo.value = '';
        showPhoto(null);
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Preparing photo…';
      preparing = shrinkPhoto(file).then(small => {
        if (small !== file) {
          try {
            const dt = new DataTransfer();
            dt.items.add(small);
            photo.files = dt.files;
          } catch (e) { small = file; /* older browser: send the original */ }
        }
        showPhoto(small);
        if (small.size > MAX_PHOTO_BYTES) error.textContent = `That photo is too big (${formatBytes(small.size)}). Please pick one under 5 MB.`;
      }).finally(() => {
        preparing = null;
        submit.disabled = false;
        submit.textContent = 'Send request ✉️';
      });
    }

    photo.addEventListener('change', () => takePhoto(photo.files[0]));
    $('#req-photo-remove').addEventListener('click', () => { photo.value = ''; takePhoto(null); });
    ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, e => {
      e.preventDefault();
      dropzone.classList.add('is-drag');
    }));
    ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, () => dropzone.classList.remove('is-drag')));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      try { photo.files = e.dataTransfer.files; } catch (err) { /* ignore */ }
      takePhoto(file);
    });

    form.addEventListener('submit', e => {
      error.textContent = '';
      const name = $('#req-name').value.trim();
      const email = $('#req-email').value.trim();
      const reason = $('#req-reason').value.trim();
      const problems = [];
      if (!name) problems.push('your name');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push('your university email');
      if (reason.length < 10) problems.push('a short description of what you did');
      if (preparing) { e.preventDefault(); error.textContent = 'Hang on, the photo is still being prepared…'; return; }
      if (problems.length) { e.preventDefault(); error.textContent = 'Please add ' + problems.join(', ').replace(/, ([^,]*)$/, ' and $1') + '.'; return; }
      if (photo.files[0] && photo.files[0].size > MAX_PHOTO_BYTES) { e.preventDefault(); error.textContent = 'That photo is too big. Please pick one under 5 MB.'; return; }
      if (!cfg.requestEmail) { e.preventDefault(); error.textContent = 'Requests aren\'t set up yet. Please message the admin directly.'; return; }

      form.elements._subject.value = `Dorm points request: ${name}`;
      form.elements._next.value = location.href.split(/[?#]/)[0] + '?sent=1#request';
      submit.disabled = true;
      submit.textContent = 'Sending…';
      // The browser now posts the form to FormSubmit, which emails the admin and sends us back here.
    });

    // Re-enable the button if the visitor comes back with the browser's back button.
    window.addEventListener('pageshow', () => { submit.disabled = false; submit.textContent = 'Send request ✉️'; });

    $('#request-again').addEventListener('click', () => {
      $('#request-sent').hidden = true;
      form.hidden = false;
      form.reset();
      $('#req-date').value = today();
      showPhoto(null);
      const me = store.get(MY_NAME_KEY);
      if (me) $('#req-name').value = me;
    });

    const params = new URLSearchParams(location.search);
    if (params.get('sent') === '1') {
      form.hidden = true;
      $('#request-sent').hidden = false;
      history.replaceState(null, '', location.pathname + '#request');
      requestAnimationFrame(() => $('#request').scrollIntoView());
    }
  }

  // ------------------------------------------------------------------ start

  async function loadPoints() {
    const res = await fetch('data/points.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function start() {
    renderRules();
    setupRequestForm();

    arena = new window.BubbleArena($('#arena'), { onSelect: showCard, onBubbleClick });
    setupHover();
    $('#arena').addEventListener('click', e => {
      if (e.target.closest('.card-close') || (!e.target.closest('.bubble') && !e.target.closest('.bubble-card'))) arena.select(null);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') arena.select(null); });
    $('#findme').addEventListener('submit', e => { e.preventDefault(); findMe($('#findme-input').value); });
    $('#everyone-search').addEventListener('input', e => filterEveryone(e.target.value));
    document.addEventListener('click', e => {
      const btn = e.target.closest('button[data-key]');
      if (btn && !btn.closest('#arena')) jumpToBubble(btn.dataset.key);
    });
    $('#log-search').addEventListener('input', () => { logShown = LOG_PAGE; renderLog(); });
    $('#log-category').addEventListener('change', () => { logShown = LOG_PAGE; renderLog(); });
    $('#log-more').addEventListener('click', () => { logShown += LOG_PAGE * 2; renderLog(); });

    let data;
    try {
      data = await loadPoints();
    } catch (err) {
      $('#arena-message').textContent = 'Couldn\'t load the points right now. Please refresh in a moment.';
      return;
    }
    // `label` is the agreed website name ('' = anonymous); `name` is what screen readers hear.
    ranked = core.rankStudents((data.students || []).filter(s => s && s.key).map(s => ({
      id: s.key,
      name: s.name || '',
      label: s.name || '',
      points: Number(s.points) || 0,
      entries: [],
    })));
    for (const s of ranked) s.name = s.label || ANON;
    byKey = new Map(ranked.map(s => [s.id, s]));
    log = (data.log || []).filter(e => e && byKey.has(e.who)).map(e => ({
      student: byKey.get(e.who),
      date: e.date || '',
      category: e.category || 'Other',
      points: Number(e.points) || 0,
      reason: e.reason || '',
    }));
    for (const e of log) e.student.entries.push(e);
    $('#arena-message').hidden = ranked.length > 0;
    if (!ranked.length) $('#arena-message').textContent = 'No students yet. Check back soon!';

    renderStats(data);
    renderTop();
    renderEveryone();
    renderLogFilters();
    renderLog();
    arena.setStudents(ranked);

    const savedName = store.get(MY_NAME_KEY);
    if (savedName) {
      const me = ranked.find(s => s.label && s.label.toLowerCase() === savedName.toLowerCase());
      if (me) findMe(me.label, { quiet: true });
      else store.remove(MY_NAME_KEY);
    }
  }

  start();
})();
