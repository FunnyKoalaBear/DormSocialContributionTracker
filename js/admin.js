/* Dorm Points: admin page (paste from Excel, preview, publish to GitHub). */
(function () {
  'use strict';

  const cfg = window.DORM_CONFIG || {};
  const gh = cfg.github || {};
  const core = window.DormCore;
  const $ = sel => document.querySelector(sel);
  const TOKEN_KEY = 'dormPoints.githubToken';

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* private mode */ } },
  };

  let current = null;         // what the website shows now
  let overrides = {};         // student ID -> bubble name typed by hand
  let parsed = null;          // result of DormCore.parseStudents

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function notice(kind, html) { return `<div class="notice notice-${kind}">${html}</div>`; }
  function siteUrl() { return location.href.replace(/admin\.html.*$/, ''); }

  // ------------------------------------------------------------------ current data

  async function loadCurrent() {
    try {
      const res = await fetch('data/points.json?v=' + Date.now(), { cache: 'no-store' });
      if (res.ok) current = await res.json();
    } catch (e) { /* first run, or offline */ }
    overrides = Object.assign({}, (current && current.names) || {});
    if (parsed) update();
  }

  // ------------------------------------------------------------------ preview

  function update() {
    const text = $('#paste').value;
    const summary = $('#summary');
    if (!text.trim()) {
      parsed = null;
      summary.innerHTML = '';
      $('#preview').hidden = true;
      return;
    }
    parsed = core.parseStudents(text, overrides);
    if (parsed.error) {
      summary.innerHTML = notice('error', esc(parsed.error));
      $('#preview').hidden = true;
      return;
    }

    const before = new Map(((current && current.students) || []).map(s => [s.id, s]));
    const ranked = core.rankStudents(parsed.students);
    let changed = 0;
    let added = 0;
    $('#preview-body').innerHTML = ranked.map(s => {
      const old = before.get(s.id);
      let diff = '<span class="diff-same">–</span>';
      if (!old) { diff = '<span class="diff-new">new</span>'; added++; }
      else if (old.points !== s.points) {
        const d = s.points - old.points;
        diff = `<span class="${d > 0 ? 'diff-up' : 'diff-down'}">${d > 0 ? '▲ +' : '▼ −'}${Math.abs(d)}</span>`;
        changed++;
      }
      return `<tr><td>${s.rank}</td><td class="mono">${esc(s.id)}</td><td class="muted">${esc(s.fullName)}</td>` +
        `<td><input class="name-edit${overrides[s.id] ? ' is-custom' : ''}" data-id="${esc(s.id)}" value="${esc(s.name)}" placeholder="${esc(s.autoName)}" aria-label="Bubble name for ${esc(s.id)}"></td>` +
        `<td class="num pts">${s.points < 0 ? '−' : ''}${Math.abs(s.points)}</td><td class="num">${diff}</td></tr>`;
    }).join('');

    const present = new Set(parsed.students.map(s => s.id));
    const removed = Array.from(before.values()).filter(s => !present.has(s.id));
    $('#removed').innerHTML = removed.length
      ? notice('warn', `<b>${removed.length} student${removed.length > 1 ? 's are' : ' is'} on the website but not in your paste</b>, so publishing will remove them: ` +
        removed.map(s => `${esc(s.name)} (${esc(s.id)})`).join(', ') + '.')
      : '';

    const total = parsed.students.reduce((sum, s) => sum + s.points, 0);
    let html = notice('ok', `Found <b>${parsed.students.length}</b> students with <b>${total}</b> points in total.` +
      (current ? ` Compared with the website: <b>${changed}</b> changed, <b>${added}</b> new, <b>${removed.length}</b> removed.` : ''));
    if (parsed.warnings.length) html += notice('warn', '<b>Please check:</b><ul>' + parsed.warnings.map(w => `<li>${esc(w)}</li>`).join('') + '</ul>');
    if (parsed.skipped.length) html += notice('info', 'Skipped rows that aren\'t students: ' + parsed.skipped.map(s => `${esc(s.id)} (row ${s.line})`).join(', ') + '.');
    summary.innerHTML = html;
    $('#preview').hidden = false;
    $('#publish-status').innerHTML = '';
  }

  function onNameEdit(e) {
    const input = e.target.closest('.name-edit');
    if (!input || !parsed) return;
    const id = input.dataset.id;
    const s = parsed.students.find(x => x.id === id);
    const value = input.value.trim();
    if (!value || value === s.autoName) delete overrides[id];
    else overrides[id] = value;
    s.name = value || s.autoName;
    input.classList.toggle('is-custom', !!overrides[id]);
  }

  function buildFile() {
    const present = new Set(parsed.students.map(s => s.id));
    const keep = {};
    for (const id of Object.keys(overrides)) if (present.has(id)) keep[id] = overrides[id];
    return core.buildPointsFile(parsed.students, keep, new Date().toISOString());
  }

  // ------------------------------------------------------------------ GitHub

  function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function api(path, token, init) {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    return fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}${path}`, Object.assign({ headers, cache: 'no-store' }, init));
  }

  async function explain(res) {
    let message = '';
    try { message = (await res.json()).message || ''; } catch (e) { /* not JSON */ }
    if (res.status === 401) return 'GitHub didn\'t accept the key. It may be mistyped or expired. Make a new one in the setup section below.';
    if (res.status === 403) return 'The key isn\'t allowed to change this repository. Check that <i>Contents</i> is set to <b>Read and write</b>.';
    if (res.status === 404) return `The key can't see the repository <b>${esc(gh.owner)}/${esc(gh.repo)}</b>. When making the key, pick this repository under <i>Only select repositories</i>.`;
    if (res.status === 409 || res.status === 422) return 'The points file changed on GitHub while publishing. Please click Publish again.';
    return `GitHub said: ${esc(message || res.statusText || 'error ' + res.status)}`;
  }

  /** The branch GitHub Pages serves from (or the repository's main branch). */
  async function findBranch(token) {
    if (gh.branch) return gh.branch;
    const pages = await api('/pages', token);
    if (pages.ok) {
      const info = await pages.json();
      if (info.source && info.source.branch) return info.source.branch;
    }
    const repo = await api('', token);
    if (!repo.ok) throw new Error(await explain(repo));
    return (await repo.json()).default_branch;
  }

  async function publish() {
    const status = $('#publish-status');
    const token = store.get(TOKEN_KEY);
    if (!parsed || parsed.error) return;
    if (!token) {
      status.innerHTML = notice('warn', 'First add your publishing key in the <a href="#setup">setup section</a> below (one time only). Or use <b>Download points.json</b> and upload it by hand.');
      return;
    }
    const button = $('#publish');
    button.disabled = true;
    button.textContent = 'Publishing…';
    status.innerHTML = '';
    try {
      const content = buildFile();
      const branch = await findBranch(token);
      const path = '/contents/' + gh.path.split('/').map(encodeURIComponent).join('/');
      const existing = await api(`${path}?ref=${encodeURIComponent(branch)}`, token);
      let sha;
      if (existing.ok) sha = (await existing.json()).sha;
      else if (existing.status !== 404) throw new Error(await explain(existing));
      const today = new Date().toISOString().slice(0, 10);
      const res = await api(path, token, {
        method: 'PUT',
        body: JSON.stringify({ message: `Update dorm points (${today})`, content: toBase64(content), sha, branch }),
      });
      if (!res.ok) throw new Error(await explain(res));
      current = JSON.parse(content);
      update();
      status.innerHTML = notice('ok', `<b>Published! 🎉</b> The website shows the new points in about a minute. <a href="${esc(siteUrl())}" target="_blank" rel="noopener">Open the website</a>`);
    } catch (err) {
      const msg = err instanceof TypeError ? 'Couldn\'t reach GitHub. Check your internet connection and try again.' : err.message;
      status.innerHTML = notice('error', msg);
    } finally {
      button.disabled = false;
      button.textContent = 'Publish to website 🚀';
    }
  }

  function download() {
    const blob = new Blob([buildFile()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'points.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $('#publish-status').innerHTML = notice('info', 'Downloaded <b>points.json</b>. Upload it to the <b>data</b> folder on GitHub (see "Update by hand" below).');
  }

  // ------------------------------------------------------------------ key setup

  async function checkToken(token) {
    const state = $('#token-state');
    state.innerHTML = notice('info', 'Checking the key with GitHub…');
    try {
      const res = await api('', token);
      if (!res.ok) { state.innerHTML = notice('error', await explain(res)); return false; }
      const repo = await res.json();
      if (repo.permissions && !repo.permissions.push) {
        state.innerHTML = notice('error', 'This key can read the repository but not change it. Set <i>Contents</i> to <b>Read and write</b>.');
        return false;
      }
      state.innerHTML = notice('ok', `<b>Key saved and working.</b> Publishing goes to <b>${esc(repo.full_name)}</b>.`);
      return true;
    } catch (e) {
      state.innerHTML = notice('error', 'Couldn\'t reach GitHub. Check your internet connection.');
      return false;
    }
  }

  function showTokenState() {
    const has = !!store.get(TOKEN_KEY);
    $('#forget-token').hidden = !has;
    $('#token').placeholder = has ? '•••••••• (key saved, paste a new one to replace it)' : 'github_pat_…';
    if (has && !$('#token-state').innerHTML) $('#token-state').innerHTML = notice('ok', 'A publishing key is saved on this device.');
    if (!has) $('#token-state').innerHTML = '';
  }

  // ------------------------------------------------------------------ start

  $('#repo-owner').textContent = gh.owner || 'the repository owner';
  $('#repo-name').textContent = gh.repo || 'the website repository';
  let timer = null;
  $('#paste').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 150); });
  $('#clear-paste').addEventListener('click', () => { $('#paste').value = ''; update(); $('#paste').focus(); });
  $('#preview-body').addEventListener('input', onNameEdit);
  $('#publish').addEventListener('click', publish);
  $('#download').addEventListener('click', download);
  $('#token-form').addEventListener('submit', async e => {
    e.preventDefault();
    const token = $('#token').value.trim();
    if (!token) return;
    store.set(TOKEN_KEY, token);
    $('#token').value = '';
    showTokenState();
    await checkToken(token);
  });
  $('#forget-token').addEventListener('click', () => {
    store.remove(TOKEN_KEY);
    showTokenState();
    $('#token-state').innerHTML = notice('info', 'The key was removed from this device.');
  });
  showTokenState();
  loadCurrent();
})();
