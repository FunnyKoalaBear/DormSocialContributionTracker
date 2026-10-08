/*
 * Dorm Points: shared logic (no DOM).
 * Parses what you paste from Excel, works out first names and ranks.
 * Used by the main page, the admin page and the tests (Node).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DormCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STUDENT_ID_RE = /^[0-9]{4}[A-Za-z][0-9]{3,4}$/; // e.g. 2026B694
  const CJK_RE = /[぀-ヿ㐀-鿿豈-﫿가-힯]/;
  // Given names that usually aren't what people are called by ("Muhammad Awais" -> "Awais").
  const SKIP_FIRST = new Set(['muhammad', 'muhammed', 'mohammad', 'mohammed', 'mohamed', 'mohamad', 'md', 'mohd', 'syed', 'sayed', 'sayyid']);
  // Name prefixes that belong with the next word ("Abu Bakar").
  const JOIN_NEXT = new Set(['abu', 'abd', 'abdul', 'abdel']);

  function clean(value) {
    return String(value == null ? '' : value).replace(/ /g, ' ').trim();
  }

  // ---------------------------------------------------------------- table text

  /** Splits pasted spreadsheet text into rows of cells. Handles Excel's quoting. */
  function parseTable(text) {
    text = String(text || '').replace(/^﻿/, '');
    const delim = text.includes('\t') ? '\t' : ',';
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += c;
      } else if (c === '"' && field === '') {
        inQuotes = true;
      } else if (c === delim) {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function parseNumber(value) {
    let s = clean(value).replace(/[−‒–—－]/g, '-').replace(/[,\s]/g, '');
    if (s === '') return null;
    const acct = s.match(/^\((\d+(?:\.\d+)?)\)$/); // accounting style (5) = -5
    if (acct) s = '-' + acct[1];
    if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  }

  // ---------------------------------------------------------------- names

  function letters(word) { return word.replace(/[^\p{L}]/gu, ''); }

  function isCapsWord(word) {
    const l = letters(word);
    return l.length > 1 && l === l.toUpperCase() && l !== l.toLowerCase();
  }

  function titleCase(word) {
    return word.toLowerCase().replace(/(^|[-'\s])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
  }

  /**
   * Picks the name to show on a bubble from a full name written "SURNAME Given Names".
   *   "SAIEF Easir Al" -> "Easir", "ANWAR Muhammad Awais" -> "Awais",
   *   "JINAN M A Munim" -> "Munim", "有吉 悠人" -> "悠人",
   *   names without a CAPS surname (e.g. "Hein Thant Sin") are kept whole.
   */
  function firstNameOf(fullName) {
    const full = clean(fullName);
    const words = full.split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    if (CJK_RE.test(full)) return words[words.length - 1];
    if (words.length === 1) return isCapsWord(words[0]) ? titleCase(words[0]) : words[0];

    let i = 0;
    while (i < words.length && isCapsWord(words[i])) i++;
    if (i === 0) return full;
    if (i === words.length) i = 1; // ALL CAPS: assume the first word is the surname
    const given = words.slice(i).map(w => (isCapsWord(w) ? titleCase(w) : w));

    let j = 0;
    while (j < given.length - 1 && letters(given[j]).length <= 1) j++; // skip initials
    if (j < given.length - 1 && SKIP_FIRST.has(given[j].toLowerCase())) j++;
    if (j < given.length - 1 && JOIN_NEXT.has(given[j].toLowerCase())) return given[j] + ' ' + given[j + 1];
    return given[j];
  }

  // ---------------------------------------------------------------- students

  const HEADER_TESTS = [
    ['name', h => /name|名前|氏名/.test(h)],
    ['total', h => /^total|合計/.test(h)],
    ['points', h => /^(points?|pts|score)$/.test(h)],
    ['start', h => /start/.test(h)],
    ['earned', h => /earn/.test(h)],
    ['lost', h => /lost|deduct/.test(h)],
    ['log', h => /^(category|date|reason|recorded)/.test(h)],
  ];

  function findHeader(rows) {
    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const cells = rows[r].map(c => clean(c).toLowerCase().replace(/\s+/g, ' '));
      // Header cells are short; this skips instruction text that mentions "Student ID".
      const idCol = cells.findIndex(h => h.length <= 20 && /^(student ?id|id$|学籍)/.test(h));
      if (idCol < 0) continue;
      const cols = { id: idCol };
      cells.forEach((h, i) => {
        if (i === idCol || !h) return;
        for (const [key, test] of HEADER_TESTS) {
          if (cols[key] == null && test(h)) { cols[key] = i; break; }
        }
      });
      return { index: r, cols };
    }
    return null;
  }

  /**
   * Reads students from text pasted from the "Students" tab.
   * Returns { students: [{id, fullName, autoName, name, points}], warnings: [], skipped: [], error }
   * `nameOverrides` maps student ID -> name the admin typed in by hand.
   */
  function parseStudents(text, nameOverrides) {
    const overrides = nameOverrides || {};
    const out = { students: [], warnings: [], skipped: [], error: null };
    const rows = parseTable(text).filter(r => r.some(c => clean(c) !== ''));
    if (!rows.length) { out.error = 'Nothing to read yet. Paste your Students tab first.'; return out; }

    const header = findHeader(rows);
    let entries = [];

    if (header) {
      const { cols } = header;
      if (cols.log != null && cols.total == null) {
        out.error = 'This looks like the Points Log tab. Please copy the Students tab instead (it has the Total column).';
        return out;
      }
      if (cols.total == null && cols.points == null && cols.earned == null) {
        out.error = 'Found the "Student ID" column but no "Total" column. Copy the whole Students tab (Ctrl+A, then Ctrl+C).';
        return out;
      }
      for (let r = header.index + 1; r < rows.length; r++) {
        const row = rows[r];
        const cell = key => (cols[key] == null ? '' : row[cols[key]]);
        const id = clean(cell('id'));
        if (!id) continue;
        let raw;
        let points;
        if (cols.total != null || cols.points != null) {
          raw = clean(cell(cols.total != null ? 'total' : 'points'));
          points = parseNumber(raw);
        } else {
          raw = [cell('start'), cell('earned'), cell('lost')].map(clean).join(' ');
          points = ['start', 'earned', 'lost'].reduce((sum, k) => sum + (parseNumber(cell(k)) || 0), 0);
        }
        entries.push({ line: r + 1, id, fullName: clean(cell('name')), raw, points });
      }
    } else {
      // No header row: accept simple "ID, Name, Points" or "ID, Points" rows.
      for (let r = 0; r < rows.length; r++) {
        const cells = rows[r].map(clean).filter(Boolean);
        if (!cells.length || !STUDENT_ID_RE.test(cells[0]) || cells.length > 3) continue;
        const raw = cells[cells.length - 1];
        entries.push({
          line: r + 1,
          id: cells[0],
          fullName: cells.length === 3 ? cells[1] : '',
          raw,
          points: cells.length > 1 ? parseNumber(raw) : null,
        });
      }
      if (!entries.length) {
        out.error = 'Couldn\'t find the header row. Make sure you copy the row with "Student ID" and "Total" too (Ctrl+A on the Students tab is easiest).';
        return out;
      }
    }

    const seen = new Map();
    for (const e of entries) {
      if (!/\d/.test(e.id)) { out.skipped.push({ line: e.line, id: e.id, reason: 'not a student ID' }); continue; }
      const id = e.id.toUpperCase();
      let points = e.points;
      if (points == null) {
        if (e.raw === '') {
          points = 0;
          out.warnings.push(`Row ${e.line} (${id}): no total, counted as 0 points.`);
        } else {
          out.warnings.push(`Row ${e.line} (${id}): "${e.raw}" isn't a number, so this row was skipped.`);
          continue;
        }
      }
      if (seen.has(id)) {
        out.warnings.push(`Row ${e.line}: ${id} appears twice. Kept the first row (row ${seen.get(id)}).`);
        continue;
      }
      seen.set(id, e.line);
      const autoName = firstNameOf(e.fullName) || id;
      out.students.push({ id, fullName: e.fullName, autoName, name: clean(overrides[id]) || autoName, points });
    }
    if (!out.students.length && !out.error) out.error = 'No students found in what you pasted.';
    return out;
  }

  // ---------------------------------------------------------------- ranking

  /** Sorts by points (high first) and adds `rank`; ties share a rank (1, 2, 3, 3, 5 …). */
  function rankStudents(students) {
    const sorted = students
      .map(s => Object.assign({}, s))
      .sort((a, b) => b.points - a.points || String(a.name).localeCompare(String(b.name)) || a.id.localeCompare(b.id));
    let rank = 0;
    let prev = null;
    sorted.forEach((s, i) => {
      if (s.points !== prev) { rank = i + 1; prev = s.points; }
      s.rank = rank;
    });
    return sorted;
  }

  /** The JSON the website reads (only ID, shown name and points are published). */
  function buildPointsFile(students, nameOverrides, updated) {
    const names = {};
    for (const [id, name] of Object.entries(nameOverrides || {})) {
      if (clean(name)) names[id] = clean(name);
    }
    const list = rankStudents(students).map(s => ({ id: s.id, name: s.name, points: s.points }));
    const lines = list.map(s => '    ' + JSON.stringify(s));
    return '{\n' +
      `  "updated": ${JSON.stringify(updated || new Date().toISOString())},\n` +
      '  "students": [\n' + lines.join(',\n') + '\n  ],\n' +
      `  "names": ${JSON.stringify(names, null, 2).replace(/\n/g, '\n  ')}\n` +
      '}\n';
  }

  /** "2026b694", " 2026B694@kuas.ac.jp " -> "2026B694" */
  function normalizeId(input) {
    return clean(input).replace(/@.*$/, '').replace(/\s+/g, '').toUpperCase();
  }

  return {
    STUDENT_ID_RE,
    parseTable,
    parseNumber,
    firstNameOf,
    parseStudents,
    rankStudents,
    buildPointsFile,
    normalizeId,
  };
});
