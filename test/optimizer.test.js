const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/dates.js');
const O = require('../js/optimizer.js');

// Builds optimizer input for a year. presetDays: { 'MM-DD': weight }, planned: Set of ISO dates
function year(y, state, { weights = {}, planned = new Set() } = {}) {
  const hol = D.publicHolidays(y, state);
  const days = [];
  for (let i = 0; i < D.daysInYear(y); i++) {
    const date = D.addDays(D.iso(y, 1, 1), i);
    const weekend = D.weekday(date) >= 5;
    const weight = weights[date.slice(5)] ?? 1;
    const free = weekend || hol.has(date) || weight === 0;
    days.push({ date, weekend, free, planned: !free && planned.has(date), cost: free ? 0 : weight, school: false });
  }
  return days;
}

const fmt = (days, b) => `${days[b.start].date}..${days[b.end].date} cost=${b.cost} len=${b.length}`;

test('dates: easter, iso week, NRW holidays 2027', () => {
  assert.strictEqual(D.easter(2027), '2027-03-28');
  assert.strictEqual(D.isoWeek('2027-01-01'), 53);
  assert.strictEqual(D.isoWeek('2027-01-04'), 1);
  assert.strictEqual(D.isoWeek('2027-12-27'), 52);
  const h = D.publicHolidays(2027, 'NW');
  assert.strictEqual(h.get('2027-05-27'), 'Fronleichnam');
  assert.strictEqual(h.get('2027-11-01'), 'Allerheiligen');
  assert.strictEqual(h.size, 11);
});

test('one vacation day goes to the Tuesday after Easter (5 days off)', () => {
  const days = year(2027, 'NW');
  const r = O.optimize(days, { budget: 1, minLen: 3 });
  assert.strictEqual(r.blocks.length, 1);
  assert.strictEqual(r.blocks[0].length, 5);
  assert.strictEqual(days[r.blocks[0].taken[0]].date, '2027-03-30');
});

test('two vacation days: Easter Tuesday plus a bridge day', () => {
  const days = year(2027, 'NW');
  const r = O.optimize(days, { budget: 2, minLen: 3 });
  assert.strictEqual(r.gain, 9); // Easter (5) + one bridge day (4)
});

test('budget is respected and blocks do not touch', () => {
  const days = year(2027, 'NW');
  for (const budget of [5, 12, 30]) {
    const r = O.optimize(days, { budget, minLen: 3, maxLen: 16 });
    assert.ok(r.cost <= budget, `cost ${r.cost} > ${budget}`);
    for (let i = 1; i < r.blocks.length; i++) assert.ok(r.blocks[i].start > r.blocks[i - 1].end + 1);
  }
});

test('maxBlocks limits the number of breaks', () => {
  const days = year(2027, 'NW');
  const r = O.optimize(days, { budget: 20, minLen: 3, maxLen: 20, maxBlocks: 2 });
  assert.ok(r.blocks.length <= 2);
  assert.ok(r.cost <= 20);
});

test('presets: half days and the week between Christmas and New Year', () => {
  const planned = new Set();
  for (let d = '2027-12-24'; d <= '2027-12-31'; d = D.addDays(d, 1)) planned.add(d);
  const days = year(2027, 'NW', { weights: { '12-24': 0.5, '12-31': 0.5 }, planned });
  const cost = days.filter((d) => d.planned).reduce((s, d) => s + d.cost, 0);
  assert.strictEqual(cost, 5);
  // Extending the booked Christmas break is only credited with the new days.
  const r = O.optimize(days, { budget: 4, minLen: 3 });
  for (const b of r.blocks) assert.ok(b.gain <= b.length);
});

test('opportunities list bridge days first', () => {
  const days = year(2027, 'NW');
  const ops = O.opportunities(days, { budget: 30, minLen: 3 });
  const dates = ops.map((o) => fmt(days, o));
  assert.ok(dates.some((s) => s.startsWith('2027-05-06..2027-05-09')), dates.join('\n'));
  assert.ok(dates.some((s) => s.startsWith('2027-05-27..2027-05-30')), dates.join('\n'));
});

test('performance: 30 days, unlimited blocks', () => {
  const days = year(2027, 'NW');
  const t = Date.now();
  const r = O.optimize(days, { budget: 30, minLen: 3, maxLen: 16 });
  const ms = Date.now() - t;
  console.log(`  ${ms} ms, ${r.blocks.length} blocks, ${r.cost} days -> ${r.gain} days off`);
  r.blocks.forEach((b) => console.log('   ', fmt(days, b)));
  assert.ok(ms < 2000);
});
