// Run with: node --test tests/core.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');

// Shaped like SheetJS sheet_to_json(ws, { header: 1, raw: true }) on the tracker (names are made up).
function workbook() {
  return {
    Students: [
      ['Social Contribution Points: Students'],
      ['Fill in names (yellow cells). Totals update automatically from the Points Log.'],
      ['Dorm total:', 27],
      [],
      ['#', 'Student ID', 'Name', 'Starting Points', 'Points Earned', 'Points Lost', 'Entries', 'Total', 'Rank', 'Website Name'],
      [56, '', '', '', '', '', '', '', '', ''],
      [1, '2026B100', 'TANAKA Kenji Ray', 0, 14, 0, 2, 14, 1, 'Ken'],
      [2, '2026M200', 'RAHMAN Muhammad Arif', 0, 8, 0, 1, 8, 2, ''],
      [3, '2026M300', 'LEE Ana Maria', 2, 6, 0, 1, 8, 2, 'Ana'],
      [4, '2026B400', 'KOVAC Ivan', 0, 6, -5, 2, 1, 4, ''],
      [5, '2025M500', '山田 太郎', 0, 0, 0, 0, 0, 5, ''],
    ],
    'Points Log': [
      ['Points Log'],
      ['One row per add/subtract. Fill the yellow columns: Date, Student ID, Category, Reason.'],
      [],
      [],
      ['Date', 'Student ID', 'Name', 'Category', 'Custom Points\n(optional)', 'Points', 'Reason / Details', 'Recorded By'],
      [46282, '2026B100', 'TANAKA Kenji Ray', 'Dorm Event', '', 6, '', 'Admin'],
      [46282, '2026B400', 'KOVAC Ivan', 'Dorm Event', '', 6, '', 'Admin'],
      [46282, '2026M300', 'LEE Ana Maria', 'Dorm Event', '', 6, '', 'Admin'],
      ['2026-10-09', '2026B100', 'TANAKA Kenji Ray', 'Dorm Initiative', 3, 8, 'Cleaned the kitchen with Arif', 'Admin'],
      ['2026-10-09', '2026M200', 'RAHMAN Muhammad Arif', 'Dorm Initiative', 8, '', 'Cleaned the kitchen with Kenji', 'Admin'],
      ['2026-10-10', '2026B400', 'KOVAC Ivan', 'Rule Violation', '', '', '', 'Admin'],
      ['2026-10-11', '2026X999', 'Nobody', 'Meeting', '', 4, '', 'Admin'],
    ],
    'Point System': [
      ['The Social Contribution System'],
      [],
      [],
      ['Category', 'Points', 'Notes'],
      ['Dorm Event', 6, ''],
      ['Rule Violation', -5, ''],
      ['Dorm Initiative', '', 'type 2 to 8 points in the log'],
    ],
  };
}

test('reads students, website names and the points log', () => {
  const res = core.parseWorkbook(workbook());
  assert.equal(res.error, null);
  assert.deepEqual(
    res.students.map(s => [s.id, s.name, s.points, s.entries.length]),
    [
      ['2026B100', 'Ken', 14, 2],
      ['2026M200', '', 8, 1],
      ['2026M300', 'Ana', 8, 2], // 2 starting points + 6
      ['2026B400', '', 1, 2], // Rule Violation filled in from the Point System
      ['2025M500', '', 0, 0],
    ],
  );
  assert.equal(res.log[0].date, '2026-09-17'); // Excel date serial
  assert.equal(res.log.length, 6);
});

test('warns about mismatched points and unknown IDs', () => {
  const res = core.parseWorkbook(workbook());
  assert.ok(res.warnings.some(w => /Custom Points.*row 9 \(custom 3, used 8\)/.test(w)));
  assert.ok(res.warnings.some(w => /2026X999 isn't on the Students tab/.test(w)));
  assert.ok(!res.warnings.some(w => /Total says/.test(w)));
});

test('swaps names in reasons: website name if shown, otherwise "a dorm-mate"', () => {
  const res = core.parseWorkbook(workbook());
  const reasons = res.log.filter(e => e.reason).map(e => e.publicReason);
  assert.deepEqual(reasons, ['Cleaned the kitchen with a dorm-mate', 'Cleaned the kitchen with Ken']);
  const students = [{ fullName: 'SIDDIQUE Abu Bakar', name: 'Abu Bakar' }, { fullName: 'BADAMKHATAN Munkh-Ochir', name: '' }];
  assert.equal(core.redactReason('Helped Abu Bakar and Munkh-Ochir', students).text, 'Helped Abu Bakar and a dorm-mate');
  assert.equal(core.redactReason('Brought trash back from beach', students).changed, false);
});

test('ranks ties together, named students first', () => {
  const ranked = core.rankStudents(core.parseWorkbook(workbook()).students);
  assert.deepEqual(ranked.map(s => [s.name, s.rank]), [['Ken', 1], ['Ana', 2], ['', 2], ['', 4], ['', 5]]);
});

test('the published file has no student IDs or full names', () => {
  const res = core.parseWorkbook(workbook());
  const text = core.buildPointsFile(res.students, '2026-10-20T00:00:00.000Z', () => 0.5);
  const data = JSON.parse(text);
  assert.doesNotMatch(text, /2026B100|2026M200|TANAKA|RAHMAN|Kenji|Arif|Admin/);
  assert.deepEqual(data.students.map(s => [s.name || null, s.points]), [['Ken', 14], ['Ana', 8], [null, 8], [null, 1], [null, 0]]);
  assert.equal(data.log.length, 7); // 6 log rows + Ana's starting points
  const ken = data.students[0].key;
  assert.deepEqual(data.log.filter(e => e.who === ken).map(e => e.points), [8, 6]);
});

test('reports a missing tab', () => {
  assert.match(core.parseWorkbook({ Students: [] }).error, /Points Log/);
  assert.match(core.parseWorkbook({}).error, /Students/);
});
