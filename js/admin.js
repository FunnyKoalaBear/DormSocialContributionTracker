/* Dorm Points: admin page (upload the Excel tracker, preview, publish to GitHub). */
(function () {
  'use strict';

  const cfg = window.DORM_CONFIG || {};
  const gh = cfg.github || {};
  const core = window.DormCore;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const TOKEN_KEY = 'dormPoints.githubToken';
  // Points per student at the last publish from this browser (kept here only, for the "Change" column).
  const LAST_KEY = 'dormPoints.lastPublished';

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* private mode */ } },
  };

  let parsed = null; // result of DormCore.parseWorkbook

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function notice(kind, html) { return `<div class="notice notice-${kind}">${html}</div>`; }
  function siteUrl() { return location.href.replace(/admin\.html.*$/, ''); }
  function lastPublished() {
    try { return JSON.parse(store.get(LAST_KEY) || 'null'); } catch (e) { return null; }
  }

  // ------------------------------------------------------------------ reading the file

  async function readFile(file) {
    const summary = $('#summary');
    $('#preview').hidden = true;
    $('#publish-status').innerHTML = '';
    showFile(file, 'Reading…');
    if (!window.XLSX) {
      summary.innerHTML = notice('error', 'The Excel reader didn\'t load. Check your internet connection and refresh the page.');
      return;
    }
    let sheets;
    try {
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      sheets = {};
      for (const name of wb.SheetNames) {
        sheets[name] = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      }
    } catch (e) {
      parsed = null;
      showFile(file, 'Couldn\'t open this file');
      summary.innerHTML = notice('error', 'That doesn\'t look like an Excel file. Choose the <b>.xlsx</b> tracker file.');
      return;
    }
    parsed = core.parseWorkbook(sheets);
    showFile(file, `Last saved ${new Date(file.lastModified).toLocaleString()}`);
    update();
  }

  function showFile(file, info) {
    const drop = $('#xlsx-drop');
    drop.classList.toggle('has-file', !!file);
    $('.dropzone-empty', drop).hidden = !!file;
    $('.dropzone-full', drop).hidden = !file;
    if (file) {
      $('#xlsx-name').textContent = file.name;
      $('#xlsx-info').textContent = info || '';
    }
  }

  // ------------------------------------------------------------------ preview

  function update() {
    const summary = $('#summary');
    if (!parsed) { summary.innerHTML = ''; $('#preview').hidden = true; return; }
    if (parsed.error) {
      summary.innerHTML = notice('error', esc(parsed.error));
      $('#preview').hidden = true;
      return;
    }

    const before = lastPublished();
    const ranked = core.rankStudents(parsed.students);
    let changed = 0;
    let added = 0;
    $('#preview-body').innerHTML = ranked.map(s => {
      let diff = '<span class="diff-same">–</span>';
      if (before) {
        const old = before[s.id];
        if (old == null) { diff = '<span class="diff-new">new</span>'; added++; }
        else if (old !== s.points) {
          const d = s.points - old;
          diff = `<span class="${d > 0 ? 'diff-up' : 'diff-down'}">${d > 0 ? '▲ +' : '▼ −'}${Math.abs(d)}</span>`;
          changed++;
        }
      }
      const shown = s.name ? `<b>${esc(s.name)}</b>` : '<span class="muted"><i>Anonymous</i> (?)</span>';
      return `<tr><td>${s.rank}</td><td>${shown}</td><td class="muted">${esc(s.fullName)}</td>` +
        `<td class="num pts">${s.points < 0 ? '−' : ''}${Math.abs(s.points)}</td><td class="num">${s.entries.length}</td><td class="num">${diff}</td></tr>`;
    }).join('');

    const total = parsed.students.reduce((sum, s) => sum + s.points, 0);
    const named = parsed.students.filter(s => s.name).length;
    let html = notice('ok', `Found <b>${parsed.students.length}</b> students (<b>${named}</b> named, <b>${parsed.students.length - named}</b> anonymous), ` +
      `<b>${parsed.log.length}</b> log entries and <b>${total}</b> points in total.` +
      (before ? ` Since your last publish from this browser: <b>${changed}</b> changed, <b>${added}</b> new.` : ''));
    if (parsed.warnings.length) html += notice('warn', '<b>Please check:</b><ul>' + parsed.warnings.map(w => `<li>${esc(w)}</li>`).join('') + '</ul>');
    const swapped = parsed.log.filter(e => e.publicReason !== e.reason);
    if (swapped.length) {
      html += notice('info', '<b>Names in reasons are swapped</b> for the website name, or “a dorm-mate” for students who aren\'t shown:<ul>' +
        swapped.map(e => `<li>${esc(e.reason)} → <b>${esc(e.publicReason)}</b></li>`).join('') + '</ul>');
    }
    summary.innerHTML = html;
    $('#preview').hidden = false;
    $('#publish-status').innerHTML = '';
  }

  function buildFile() {
    return core.buildPointsFile(parsed.students, new Date().toISOString());
  }

  function rememberPublished() {
    const snap = {};
    for (const s of parsed.students) snap[s.id] = s.points;
    store.set(LAST_KEY, JSON.stringify(snap));
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
      rememberPublished();
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


  // ------------------------------------------------------------------ password

  // SHA-256 of the admin password. This only keeps casual visitors out: the page is
  // public, so the real protection is the GitHub key, which only the admin's browser has.
  // To change the password, put the SHA-256 of the new one here.
  const PASSWORD_HASH = 'bcb6fe9ddcc2799d676f9a7e2865e68c633d8e324af27af8d4888b50cc356083';
  const UNLOCK_KEY = 'dormPoints.unlocked';

  async function sha256(text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }

  function unlock() {
    $('#lock').hidden = true;
    $('#admin-main').hidden = false;
  }

  $('#lock-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (await sha256($('#lock-password').value) === PASSWORD_HASH) {
      store.set(UNLOCK_KEY, PASSWORD_HASH);
      unlock();
    } else {
      $('#lock-error').textContent = 'Wrong password.';
      $('#lock-password').select();
    }
  });
  if (store.get(UNLOCK_KEY) === PASSWORD_HASH) unlock();

  // ------------------------------------------------------------------ start

  $('#repo-owner').textContent = gh.owner || 'the repository owner';
  $('#repo-name').textContent = gh.repo || 'the website repository';
  const fileInput = $('#xlsx-file');
  const drop = $('#xlsx-drop');
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) readFile(fileInput.files[0]); });
  ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, () => drop.classList.remove('is-drag')));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });
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
})();
