/* Dorm Points: main page. */
(function () {
  'use strict';

  const cfg = window.DORM_CONFIG || {};
  const core = window.DormCore;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const MY_ID_KEY = 'dormPoints.myId';
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
  const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } },
  };

  let ranked = [];
  let byId = new Map();
  let arena = null;

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
  function rankBadge(s) { return s.points > 0 && MEDALS[s.rank] ? MEDALS[s.rank] : `<b>${ordinal(s.rank)}</b>`; }
  function formatDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

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
      (updated ? `<li><span aria-hidden="true">🗓️</span>Updated <b>${esc(updated)}</b></li>` : '');
    $('#footer-updated').textContent = updated ? `Points updated ${updated}` : '';
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
      `<li class="top-item rank-${Math.min(s.rank, 4)}"><button type="button" data-id="${esc(s.id)}">` +
      `<span class="top-medal">${rankBadge(s)}</span>` +
      `<span class="top-name">${esc(s.name)}<small>${esc(s.id)}</small></span>` +
      `<span class="top-pts">${showPoints(s.points)}<small>${pts(s.points)}</small></span>` +
      '</button></li>').join('') +
      (top.length > shown.length ? `<li class="empty">+${top.length - shown.length} more tied</li>` : '');
  }

  function renderEveryone() {
    $('#everyone').innerHTML = ranked.map(s =>
      `<li data-search="${esc((s.name + ' ' + s.id).toLowerCase())}"><button type="button" data-id="${esc(s.id)}">` +
      `<span class="ev-rank">${s.rank}</span><span class="ev-name">${esc(s.name)}<small>${esc(s.id)}</small></span>` +
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

  function jumpToBubble(id) {
    if (!arena || !byId.has(id)) return;
    arena.select(id, { scroll: true });
  }

  // ------------------------------------------------------------------ bubble card

  function showCard(s, pos) {
    const card = $('#bubble-card');
    if (!s) { card.hidden = true; return; }
    const higher = ranked.filter(x => x.points > s.points);
    const next = higher[higher.length - 1];
    const tied = ranked.filter(x => x.points === s.points).length - 1;
    let note;
    if (!next) note = tied ? 'Sharing the top spot! 🏆' : 'Top of the dorm! 🏆';
    else note = `${next.points - s.points} more ${pts(next.points - s.points)} to catch up with ${ordinal(next.rank)} place`;
    const isMe = s.id === store.get(MY_ID_KEY);
    card.innerHTML =
      '<button type="button" class="card-close" aria-label="Close">×</button>' +
      `<div class="card-rank">${rankBadge(s)}</div>` +
      `<h3 style="font-size: ${s.name.length > 13 ? 18 : s.name.length > 9 ? 21 : 24}px">${esc(s.name)}${isMe ? ' <span class="card-you">you!</span>' : ''}</h3>` +
      `<p class="card-id">${esc(s.id)}</p>` +
      `<p class="card-points"><b>${showPoints(s.points)}</b> ${pts(s.points)}</p>` +
      `<p class="card-note">${esc(ordinal(s.rank))} of ${ranked.length}${tied ? ` · tied with ${tied} other${tied > 1 ? 's' : ''}` : ''}</p>` +
      `<p class="card-note">${esc(note)}</p>`;
    card.hidden = false;
    // Place it above the bubble, or below when there's no room.
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const x = Math.min(Math.max(pos.x - w / 2, 8), pos.width - w - 8);
    let y = pos.y - pos.r - h - 14;
    if (y < 8) y = Math.min(pos.y + pos.r + 14, pos.height - h - 8);
    card.style.left = x + 'px';
    card.style.top = Math.max(8, y) + 'px';
  }

  // ------------------------------------------------------------------ find me

  function findMe(raw, opts) {
    const quiet = opts && opts.quiet;
    const id = core.normalizeId(raw);
    const msg = $('#findme-msg');
    msg.classList.remove('is-error');
    if (!id) { msg.textContent = ''; return; }
    const s = byId.get(id);
    if (!s) {
      msg.textContent = `Hmm, ${id} isn't on the board yet. Double-check your ID, or message the admin if you're new.`;
      msg.classList.add('is-error');
      return;
    }
    store.set(MY_ID_KEY, s.id);
    arena.setMe(s.id);
    $('#findme-input').value = s.id;
    const cheer = s.rank === 1 && s.points > 0 ? ' 🏆' : s.points > 0 ? ' 🎉' : ' Let\'s get some points! 💪';
    msg.innerHTML = `Hi <b>${esc(s.name)}</b>! You're <b>${ordinal(s.rank)}</b> of ${ranked.length} with <b>${showPoints(s.points)}</b> ${pts(s.points)}.${cheer}`;
    prefillRequest(s);
    if (!quiet) arena.select(s.id, { scroll: true });
  }

  // ------------------------------------------------------------------ request form

  function prefillRequest(s) {
    const idInput = $('#req-id');
    if (!idInput.value) idInput.value = s.id;
    if (!$('#req-name').value) $('#req-name').value = s.name;
    updateRequestHint();
  }

  function studentEmail(id) {
    const pattern = cfg.studentEmailPattern;
    return pattern && core.STUDENT_ID_RE.test(id) ? pattern.replace('{id}', id.toLowerCase()) : '';
  }

  let lastAutoEmail = '';
  function updateRequestHint() {
    const id = core.normalizeId($('#req-id').value);
    const hint = $('#req-id-hint');
    const s = byId.get(id);
    hint.classList.remove('is-error');
    if (!id) hint.textContent = '';
    else if (s) hint.textContent = `Hi ${s.name}! 👋 You have ${showPoints(s.points)} ${pts(s.points)} right now.`;
    else if (ranked.length) { hint.textContent = 'This ID isn\'t on the board. Double-check it (you can still send).'; hint.classList.add('is-error'); }
    const email = $('#req-email');
    const auto = studentEmail(id);
    if (!email.value || email.value === lastAutoEmail) { email.value = auto; lastAutoEmail = auto; }
  }

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

    $('#req-id').addEventListener('input', updateRequestHint);
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
      const id = core.normalizeId($('#req-id').value);
      const reason = $('#req-reason').value.trim();
      const problems = [];
      if (!id) problems.push('your student ID');
      if (reason.length < 10) problems.push('a short description of what you did');
      if (preparing) { e.preventDefault(); error.textContent = 'Hang on, the photo is still being prepared…'; return; }
      if (problems.length) { e.preventDefault(); error.textContent = 'Please add ' + problems.join(' and ') + '.'; return; }
      if (photo.files[0] && photo.files[0].size > MAX_PHOTO_BYTES) { e.preventDefault(); error.textContent = 'That photo is too big. Please pick one under 5 MB.'; return; }
      if (!cfg.requestEmail) { e.preventDefault(); error.textContent = 'Requests aren\'t set up yet. Please message the admin directly.'; return; }

      $('#req-id').value = id;
      const name = $('#req-name').value.trim();
      form.elements._subject.value = `Dorm points request: ${name ? name + ' ' : ''}(${id})`;
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
      const me = byId.get(store.get(MY_ID_KEY));
      if (me) prefillRequest(me);
      updateRequestHint();
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

    arena = new window.BubbleArena($('#arena'), { onSelect: showCard });
    $('#arena').addEventListener('click', e => {
      if (e.target.closest('.card-close') || (!e.target.closest('.bubble') && !e.target.closest('.bubble-card'))) arena.select(null);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') arena.select(null); });
    $('#findme').addEventListener('submit', e => { e.preventDefault(); findMe($('#findme-input').value); });
    $('#everyone-search').addEventListener('input', e => filterEveryone(e.target.value));
    $('#ranking').addEventListener('click', e => {
      const btn = e.target.closest('button[data-id]');
      if (btn) jumpToBubble(btn.dataset.id);
    });

    let data;
    try {
      data = await loadPoints();
    } catch (err) {
      $('#arena-message').textContent = 'Couldn\'t load the points right now. Please refresh in a moment.';
      return;
    }
    ranked = core.rankStudents((data.students || []).filter(s => s && s.id));
    byId = new Map(ranked.map(s => [s.id, s]));
    $('#arena-message').hidden = ranked.length > 0;
    if (!ranked.length) $('#arena-message').textContent = 'No students yet. Check back soon!';

    renderStats(data);
    renderTop();
    renderEveryone();
    arena.setStudents(ranked);

    const savedId = store.get(MY_ID_KEY);
    if (savedId && byId.has(savedId)) findMe(savedId, { quiet: true });
    updateRequestHint();
  }

  start();
})();
