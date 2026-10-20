/*
 * Dorm Points: shared logic (no DOM).
 * Reads the tracker workbook, hides names that weren't agreed to, ranks students
 * and builds the public points file.
 * Used by the main page, the admin page and the tests (Node).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DormCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Name words that don't identify anyone on their own ("Muhammad", "Abu", "bin" …).
  const COMMON_NAME_WORDS = new Set([
    'muhammad', 'muhammed', 'mohammad', 'mohammed', 'mohamed', 'mohamad', 'mohd', 'syed', 'sayed',
    'abu', 'abd', 'abdul', 'abdel', 'bin', 'binti', 'van', 'von', 'der', 'den', 'del', 'ugli',
  ]);
  const ANON_MATE = 'a dorm-mate';

  function clean(value) {
    return String(value == null ? '' : value).replace(/ /g, ' ').trim();
  }

  function parseNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    let s = clean(value).replace(/[−‒–—－]/g, '-').replace(/[,\s]/g, '');
    if (s === '') return null;
    const acct = s.match(/^\((\d+(?:\.\d+)?)\)$/); // accounting style (5) = -5
    if (acct) s = '-' + acct[1];
    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  }

  /** Excel date serial, Date or "2026-09-17" / "2026/9/17" -> "2026-09-17" (or '' if unknown). */
  function parseDate(value) {
    if (value instanceof Date && !isNaN(value)) {
      const p = n => String(n).padStart(2, '0');
      return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
    }
    if (typeof value === 'number' && value > 20000 && value < 80000) {
      return new Date(Math.round((value - 25569) * 86400000)).toISOString().slice(0, 10);
    }
    const m = clean(value).match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
  }

  function normalizeId(value) {
    return clean(value).replace(/@.*$/, '').replace(/\s+/g, '').toUpperCase();
  }

  // ---------------------------------------------------------------- sheets

  function findSheet(sheets, test) {
    const name = Object.keys(sheets).find(n => test(n.toLowerCase()));
    return name ? sheets[name] : null;
  }

  /** Finds the header row (the one with a short "Student ID" / "Category" cell) and maps columns. */
  function findColumns(rows, mustHave, tests) {
    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const cells = (rows[r] || []).map(c => clean(c).toLowerCase().replace(/\s+/g, ' '));
      // Header cells are short; this skips instruction text that mentions the same words.
      if (!cells.some(h => h.length <= 24 && mustHave(h))) continue;
      const cols = {};
      cells.forEach((h, i) => {
        if (!h || h.length > 40) return;
        for (const [key, test] of tests) {
          if (cols[key] == null && test(h)) { cols[key] = i; break; }
        }
      });
      return { index: r, cols };
    }
    return null;
  }

  const isIdHeader = h => /^(student ?id|id$|学籍)/.test(h);

  const STUDENT_COLUMNS = [
    ['id', isIdHeader],
    ['website', h => /website|nick|display|bubble|public/.test(h)],
    ['name', h => /name|名前|氏名/.test(h)],
    ['start', h => /start/.test(h)],
    ['total', h => /^total|合計/.test(h)],
  ];
  const LOG_COLUMNS = [
    ['id', isIdHeader],
    ['date', h => /^date|日付/.test(h)],
    ['category', h => /categor/.test(h)],
    ['custom', h => /custom/.test(h)],
    ['points', h => /^(points?|pts)\b/.test(h)],
    ['reason', h => /reason|detail/.test(h)],
  ];
  const SYSTEM_COLUMNS = [
    ['category', h => /categor/.test(h)],
    ['points', h => /^(points?|pts)\b/.test(h)],
  ];

  /**
   * Reads the tracker workbook.
   * `sheets` maps sheet name -> rows (arrays of cell values), e.g. from SheetJS
   * `sheet_to_json(ws, { header: 1, raw: true, defval: '' })`.
   * Returns { students, log, warnings, error }, where each student is
   * { id, fullName, name ('' = anonymous), points, entries: [{ date, category, points, reason, row }] }.
   */
  function parseWorkbook(sheets) {
    const out = { students: [], log: [], warnings: [], error: null };
    const studentRows = findSheet(sheets, n => /student/.test(n));
    const logRows = findSheet(sheets, n => /log/.test(n));
    const systemRows = findSheet(sheets, n => /system|rule/.test(n));
    if (!studentRows) { out.error = 'Couldn\'t find the "Students" tab in this file. Is it the Social Contribution Tracker?'; return out; }
    if (!logRows) { out.error = 'Couldn\'t find the "Points Log" tab in this file. Is it the Social Contribution Tracker?'; return out; }

    // Point System: category -> points (blank = admin types the points in the log).
    const system = new Map();
    const sys = systemRows && findColumns(systemRows, h => /categor/.test(h), SYSTEM_COLUMNS);
    if (sys && sys.cols.category != null && sys.cols.points != null) {
      for (const row of systemRows.slice(sys.index + 1)) {
        const cat = clean(row[sys.cols.category]);
        const pts = parseNumber(row[sys.cols.points]);
        if (cat && pts != null) system.set(cat.toLowerCase(), pts);
      }
    }

    // Students tab.
    const st = findColumns(studentRows, isIdHeader, STUDENT_COLUMNS);
    if (!st || st.cols.id == null) { out.error = 'The Students tab has no "Student ID" header row.'; return out; }
    if (st.cols.website == null) {
      out.warnings.push('The Students tab has no "Website Name" column, so every bubble will be anonymous. Add the column and type a name only for students who agreed to be shown.');
    }
    const byId = new Map();
    const totals = new Map();
    studentRows.slice(st.index + 1).forEach((row, i) => {
      const line = st.index + i + 2;
      const id = normalizeId(row[st.cols.id]);
      if (!id || !/\d/.test(id)) return;
      if (byId.has(id)) { out.warnings.push(`Students tab row ${line}: ${id} is listed twice. Kept the first one.`); return; }
      const s = {
        id,
        fullName: clean(st.cols.name != null ? row[st.cols.name] : ''),
        name: clean(st.cols.website != null ? row[st.cols.website] : ''),
        start: parseNumber(st.cols.start != null ? row[st.cols.start] : '') || 0,
        points: 0,
        entries: [],
      };
      if (s.start) s.entries.push({ date: '', category: 'Starting points', points: s.start, reason: '', row: line });
      byId.set(id, s);
      out.students.push(s);
      const total = st.cols.total != null ? parseNumber(row[st.cols.total]) : null;
      if (total != null) totals.set(id, { total, line });
    });
    if (!out.students.length) { out.error = 'No students found on the Students tab.'; return out; }

    // Points Log tab.
    const lg = findColumns(logRows, isIdHeader, LOG_COLUMNS);
    if (!lg || lg.cols.id == null) { out.error = 'The Points Log tab has no "Student ID" header row.'; return out; }
    const mismatched = [];
    logRows.slice(lg.index + 1).forEach((row, i) => {
      const line = lg.index + i + 2;
      const cell = key => (lg.cols[key] == null ? '' : row[lg.cols[key]]);
      const id = normalizeId(cell('id'));
      if (!id) return;
      const category = clean(cell('category'));
      const custom = parseNumber(cell('custom'));
      let points = parseNumber(cell('points'));
      if (points == null) points = custom != null ? custom : system.get(category.toLowerCase());
      if (points == null) {
        if (category || clean(cell('reason'))) out.warnings.push(`Points Log row ${line} (${id}): no points could be worked out, so it was skipped. Type the points in "Custom Points".`);
        return;
      }
      if (custom != null && custom !== points) mismatched.push(`row ${line} (custom ${custom}, used ${points})`);
      const s = byId.get(id);
      if (!s) { out.warnings.push(`Points Log row ${line}: ${id} isn't on the Students tab, so its ${points} points were skipped.`); return; }
      const entry = { date: parseDate(cell('date')), category: category || 'Other', points, reason: clean(cell('reason')), row: line, id };
      s.entries.push(entry);
      out.log.push(entry);
    });
    if (mismatched.length) {
      out.warnings.push(`On ${mismatched.length} Points Log row${mismatched.length > 1 ? 's' : ''}, "Custom Points" and "Points" disagree. The website uses the Points column, like Excel's totals do: ${mismatched.join(', ')}.`);
    }

    for (const s of out.students) {
      s.points = s.entries.reduce((sum, e) => sum + e.points, 0);
      const t = totals.get(s.id);
      if (t && t.total !== s.points) {
        out.warnings.push(`Students tab row ${t.line} (${s.id}): the Total says ${t.total} but the Points Log adds up to ${s.points}. The website uses ${s.points}. (Open and save the file in Excel to refresh the totals.)`);
      }
    }

    // Likely mix-ups.
    const sameName = new Map();
    for (const s of out.students) {
      const key = s.fullName.toLowerCase().replace(/[^\p{L}]/gu, '');
      if (!key) continue;
      if (sameName.has(key)) out.warnings.push(`"${s.fullName}" is on the Students tab twice (${sameName.get(key)} and ${s.id}). One ID is probably a typo, so their points may be split.`);
      else sameName.set(key, s.id);
    }
    const shown = new Map();
    for (const s of out.students) {
      if (!s.name) continue;
      const key = s.name.toLowerCase();
      if (shown.has(key)) out.warnings.push(`Two students use the website name "${s.name}" (${shown.get(key)} and ${s.id}).`);
      else shown.set(key, s.id);
    }

    for (const e of out.log) {
      const redacted = redactReason(e.reason, out.students);
      e.publicReason = redacted.text;
    }
    for (const s of out.students) for (const e of s.entries) if (e.publicReason == null) e.publicReason = e.reason;
    return out;
  }

  // ---------------------------------------------------------------- names in reasons

  function nameWords(fullName) {
    return clean(fullName).toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  }

  /**
   * Swaps students' real names in a reason for their website name, or "a dorm-mate"
   * when they haven't agreed to be shown (or the name could be several people).
   * "Cleaned the kitchen with Quentin" -> "Cleaned the kitchen with a dorm-mate".
   */
  function redactReason(text, students) {
    const reason = clean(text);
    if (!reason) return { text: '', changed: false };
    const owners = new Map(); // name word -> students with that word
    for (const s of students) {
      for (const w of new Set(nameWords(s.fullName))) {
        if (w.length < 3 || COMMON_NAME_WORDS.has(w)) continue;
        if (!owners.has(w)) owners.set(w, []);
        owners.get(w).push(s);
      }
    }
    const tokens = [];
    const re = /\p{L}+/gu;
    let m;
    while ((m = re.exec(reason))) tokens.push({ word: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });

    let result = '';
    let pos = 0;
    let changed = false;
    for (let i = 0; i < tokens.length; i++) {
      const who = owners.get(tokens[i].word);
      if (!who) continue;
      // Grow to the whole name ("Abu Bakar", "Munkh-Ochir") when it's one person.
      let a = i;
      let b = i;
      if (who.length === 1) {
        const words = new Set(nameWords(who[0].fullName));
        const joined = (x, y) => /^[\s-]*$/.test(reason.slice(tokens[x].end, tokens[y].start));
        while (a > 0 && words.has(tokens[a - 1].word) && joined(a - 1, a)) a--;
        while (b < tokens.length - 1 && words.has(tokens[b + 1].word) && joined(b, b + 1)) b++;
      }
      const original = reason.slice(tokens[a].start, tokens[b].end);
      const replacement = who.length === 1 && who[0].name ? who[0].name : ANON_MATE;
      if (a < i && tokens[a].start < pos) continue;
      result += reason.slice(pos, tokens[a].start) + replacement;
      pos = tokens[b].end;
      if (original !== replacement) changed = true;
      i = b;
    }
    result += reason.slice(pos);
    return { text: result, changed };
  }

  // ---------------------------------------------------------------- ranking

  /** Sorts by points (high first) and adds `rank`; ties share a rank (1, 2, 3, 3, 5 …). */
  function rankStudents(students) {
    const sorted = students
      .map(s => Object.assign({}, s))
      .sort((a, b) => b.points - a.points || (!a.name - !b.name) || String(a.name || '').localeCompare(String(b.name || '')));
    let rank = 0;
    let prev = null;
    sorted.forEach((s, i) => {
      if (s.points !== prev) { rank = i + 1; prev = s.points; }
      s.rank = rank;
    });
    return sorted;
  }

  /**
   * The JSON the website reads. Student IDs and full names are never included:
   * each student gets a throwaway key, a name only if they agreed (website name),
   * their points and their log (date, category, points, reason with names swapped).
   */
  function buildPointsFile(students, updated, random) {
    const rnd = random || Math.random;
    const shuffled = students.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const ranked = rankStudents(shuffled);
    const keys = new Map(ranked.map((s, i) => [s.id, 'b' + (i + 1)]));
    const list = ranked.map(s => {
      const item = { key: keys.get(s.id) };
      if (s.name) item.name = s.name;
      item.points = s.points;
      return item;
    });
    const log = [];
    for (const s of ranked) {
      for (const e of s.entries) {
        const item = { who: keys.get(s.id), date: e.date || '', category: e.category, points: e.points };
        const reason = e.publicReason != null ? e.publicReason : e.reason;
        if (reason) item.reason = reason;
        log.push(item);
      }
    }
    log.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.who.localeCompare(b.who, 'en', { numeric: true }));
    return '{\n' +
      `  "updated": ${JSON.stringify(updated || new Date().toISOString())},\n` +
      '  "students": [\n' + list.map(s => '    ' + JSON.stringify(s)).join(',\n') + '\n  ],\n' +
      '  "log": [\n' + log.map(e => '    ' + JSON.stringify(e)).join(',\n') + '\n  ]\n' +
      '}\n';
  }

  return {
    parseNumber,
    parseDate,
    parseWorkbook,
    redactReason,
    rankStudents,
    buildPointsFile,
  };
});
