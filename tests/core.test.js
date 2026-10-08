// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');

// Shaped like Ctrl+A / Ctrl+C on the tracker's "Students" tab (names are made up).
const STUDENTS_TAB = [
  'Social Contribution Points: Students\t\t\t\t\t\t\t\t',
  'Fill in names (yellow cells). Totals update automatically from the Points Log.\t\t\t\t\t\t\t\t',
  'Dorm total:\t27\t\t\t\t\t\t\t',
  '\t\t\t\t\t\t\t\t',
  '#\tStudent ID\tName\tStarting Points\tPoints Earned\tPoints Lost\tEntries\tTotal\tRank',
  '56\t\t\t\t\t\t\t\t',
  '1\t2026B100\tTANAKA Kenji Ray\t0\t14\t0\t2\t14\t1',
  '2\t2026M200\tRAHMAN Muhammad Arif\t0\t8\t0\t2\t8\t2',
  '3\t2026M300\tLEE Ana Maria\t0\t8\t0\t2\t8\t2',
  '4\t2026B400\tKOVAC Ivan\t0\t6\t−5\t2\t1\t4',
  '5\t2025M500\t山田 太郎\t0\t0\t0\t0\t0\t5',
  '6\t2025B600\tAung Min Thu\t0\t0\t-4\t1\t-4\t6',
  '\tDORM\tWhole dorm (shared points)\t\t0\t0\t0\t0\t',
].join('\r\n') + '\r\n';

test('reads the Students tab copied from Excel', () => {
  const res = core.parseStudents(STUDENTS_TAB);
  assert.equal(res.error, null);
  assert.deepEqual(res.warnings, []);
  assert.deepEqual(res.skipped.map(s => s.id), ['DORM']);
  assert.deepEqual(
    res.students.map(s => [s.id, s.name, s.points]),
    [
      ['2026B100', 'Kenji', 14],
      ['2026M200', 'Arif', 8],
      ['2026M300', 'Ana', 8],
      ['2026B400', 'Ivan', 1],
      ['2025M500', '太郎', 0],
      ['2025B600', 'Aung Min Thu', -4],
    ],
  );
});

test('ranks ties together', () => {
  const ranked = core.rankStudents(core.parseStudents(STUDENTS_TAB).students);
  assert.deepEqual(ranked.map(s => s.rank), [1, 2, 2, 4, 5, 6]);
});

test('spots the Points Log tab and explains', () => {
  const log = [
    'Points Log\t\t\t\t\t\t\t',
    'One row per add/subtract. Fill the yellow columns: Date, Student ID, Category, Reason.\t\t\t\t\t\t\t',
    'Date\tStudent ID\tName\tCategory\t"Custom Points\n(optional)"\tPoints\tReason / Details\tRecorded By',
    '2026-09-17\t2026B100\tTANAKA Kenji Ray\tDorm Initiative\t2\t2\tMug competition\tAdmin',
  ].join('\r\n');
  assert.match(core.parseStudents(log).error, /Points Log/);
});

test('accepts a simple ID / name / points paste without a header', () => {
  const res = core.parseStudents('2026B100\tTANAKA Kenji\t12\n2026M200\t5\n');
  assert.equal(res.error, null);
  assert.deepEqual(res.students.map(s => [s.id, s.name, s.points]), [['2026B100', 'Kenji', 12], ['2026M200', '2026M200', 5]]);
});

test('warns about duplicates and bad numbers', () => {
  const res = core.parseStudents('Student ID\tName\tTotal\n2026B100\tA B\t3\n2026B100\tA B\t4\n2026M200\tC D\tabc\n2026M300\tE F\t\n');
  assert.deepEqual(res.students.map(s => [s.id, s.points]), [['2026B100', 3], ['2026M300', 0]]);
  assert.equal(res.warnings.length, 3);
});

test('uses hand-typed bubble names when given', () => {
  const res = core.parseStudents(STUDENTS_TAB, { '2025B600': 'Aung' });
  assert.equal(res.students.find(s => s.id === '2025B600').name, 'Aung');
});

test('picks a friendly first name', () => {
  const cases = {
    'SAIEF Easir Al': 'Easir',
    'HIGUERA OLIVARES Antonio Alejandro': 'Antonio',
    'ANWAR Muhammad Awais': 'Awais',
    'HAIDER Syed Farzam': 'Farzam',
    'SIDDIQUE Abu Bakar': 'Abu Bakar',
    'JINAN M A Munim': 'Munim',
    'MAROTTE-MARQUEBIELLE Sacha Jean': 'Sacha',
    'MUHAMMAD': 'Muhammad',
    'Hein Thant Sin': 'Hein Thant Sin',
    '有吉 悠人': '悠人',
    '': '',
  };
  for (const [full, first] of Object.entries(cases)) assert.equal(core.firstNameOf(full), first, full);
});

test('writes a points file with only ID, name and points', () => {
  const { students } = core.parseStudents(STUDENTS_TAB);
  const file = JSON.parse(core.buildPointsFile(students, { '2025B600': 'Aung' }, '2026-10-08T00:00:00.000Z'));
  assert.equal(file.updated, '2026-10-08T00:00:00.000Z');
  assert.deepEqual(Object.keys(file.students[0]), ['id', 'name', 'points']);
  assert.equal(file.students[0].id, '2026B100');
  assert.deepEqual(file.names, { '2025B600': 'Aung' });
});

test('normalizes typed student IDs', () => {
  assert.equal(core.normalizeId(' 2026b694 '), '2026B694');
  assert.equal(core.normalizeId('2026b694@kuas.ac.jp'), '2026B694');
});
