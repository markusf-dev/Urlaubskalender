// Vacation optimizer.
//
// Input: one entry per day of the year
//   { free, planned, cost, school, weekend }
//   free     – day off anyway (weekend, public holiday, preset with weight 0)
//   planned  – vacation already booked
//   cost     – vacation days charged when taking this day off (1 or 0.5)
//
// A "break" is a maximal run of consecutive days off. Taking the workdays
// a..b off produces the break S..E (extended over adjacent free days).
// Its gain is the number of days off it adds to *new* breaks: breaks that
// already contain booked vacation are subtracted, so extending an existing
// vacation is only credited with the extra days.
(function (root) {
  'use strict';

  // Costs are counted in half days so 0.5-day presets stay integral.
  const toUnits = (days) => Math.round(days * 2);

  function prepare(days) {
    const N = days.length;
    const off = days.map((d) => d.free || d.planned);
    const existing = new Array(N + 1).fill(0); // prefix sum of booked-break lengths by start
    const startLen = new Array(N).fill(0);
    for (let i = 0; i < N;) {
      if (!off[i]) { i++; continue; }
      let j = i, planned = false;
      while (j < N && off[j]) { if (days[j].planned) planned = true; j++; }
      if (planned) startLen[i] = j - i;
      i = j;
    }
    for (let i = 0; i < N; i++) existing[i + 1] = existing[i] + startLen[i];
    return { N, off, existing };
  }

  function candidates(days, { budgetUnits, minLen = 0, maxLen = 16, school = 'any' }) {
    const { N, off, existing } = prepare(days);
    const list = [];
    for (let a = 0; a < N; a++) {
      if (off[a]) continue;
      let S = a;
      while (S > 0 && off[S - 1]) S--;
      let cost = 0;
      for (let b = a; b < N; b++) {
        if (off[b]) continue;
        if (b - a + 1 > maxLen) break;
        if (school === 'avoid' && days[b].school) break;
        if (school === 'only' && !days[b].school) break;
        cost += toUnits(days[b].cost);
        if (cost > budgetUnits) break;
        let E = b;
        while (E + 1 < N && off[E + 1]) E++;
        const len = E - S + 1;
        const gain = len - (existing[E + 1] - existing[S]);
        if (len < minLen || gain > maxLen || gain <= 0) continue;
        list.push({ S, E, a, b, cost, len, gain });
      }
    }
    return list;
  }

  function describe(c, days) {
    const taken = [];
    for (let i = c.a; i <= c.b; i++) if (!days[i].free && !days[i].planned) taken.push(i);
    return { start: c.S, end: c.E, from: c.a, to: c.b, taken, cost: c.cost / 2, length: c.len, gain: c.gain };
  }

  // Picks non-overlapping breaks within the budget that maximise the total
  // number of days off (ties: fewer vacation days). Dynamic programming over
  // (day, remaining budget, remaining number of breaks).
  function optimize(days, opts) {
    const budgetUnits = Math.max(0, Math.floor(opts.budget * 2 + 1e-9));
    const maxBlocks = opts.maxBlocks > 0 ? Math.floor(opts.maxBlocks) : 0;
    const N = days.length;
    const byStart = Array.from({ length: N }, () => []);
    for (const c of candidates(days, { ...opts, budgetUnits })) byStart[c.S].push(c);

    const U = budgetUnits + 1, K = maxBlocks + 1;
    const at = (p, u, k) => (p * U + u) * K + k;
    const best = new Float64Array((N + 1) * U * K);
    const pick = new Int32Array((N + 1) * U * K).fill(-1);

    for (let p = N - 1; p >= 0; p--) {
      const here = byStart[p];
      for (let u = 0; u < U; u++) {
        for (let k = 0; k < K; k++) {
          let value = best[at(p + 1, u, k)], choice = -1;
          if (maxBlocks === 0 || k > 0) {
            const nextK = maxBlocks === 0 ? k : k - 1;
            for (let ci = 0; ci < here.length; ci++) {
              const c = here[ci];
              if (c.cost > u) continue;
              // E + 1 is a workday that stays a workday, so the next break starts after it.
              const v = c.gain * 1000 - c.cost + best[at(c.E + 1, u - c.cost, nextK)];
              if (v > value) { value = v; choice = ci; }
            }
          }
          best[at(p, u, k)] = value;
          pick[at(p, u, k)] = choice;
        }
      }
    }

    const blocks = [];
    let p = 0, u = budgetUnits, k = maxBlocks;
    while (p < N) {
      const ci = pick[at(p, u, k)];
      if (ci < 0) { p++; continue; }
      const c = byStart[p][ci];
      blocks.push(describe(c, days));
      u -= c.cost;
      if (maxBlocks) k--;
      p = c.E + 1;
    }
    return {
      blocks,
      cost: (budgetUnits - u) / 2,
      gain: blocks.reduce((sum, b) => sum + b.gain, 0),
    };
  }

  // Classic bridge days: short breaks that include a weekday holiday (or a
  // day off granted by a preset), ranked by days off per vacation day.
  function opportunities(days, opts, limit = 8) {
    const maxCost = opts.maxCost != null ? opts.maxCost : 5;
    const budgetUnits = Math.min(Math.floor(opts.budget * 2 + 1e-9), toUnits(maxCost));
    const bonus = (c) => {
      for (let i = c.S; i <= c.E; i++) if (days[i].free && !days[i].weekend) return true;
      return false;
    };
    const list = candidates(days, { ...opts, budgetUnits }).filter((c) => c.cost > 0 && bonus(c));
    list.sort((x, y) => y.gain / y.cost - x.gain / x.cost || y.gain - x.gain || x.S - y.S);
    const chosen = [];
    for (const c of list) {
      if (chosen.some((o) => c.S <= o.E && o.S <= c.E)) continue;
      chosen.push(c);
      if (chosen.length >= limit) break;
    }
    return chosen.sort((x, y) => x.S - y.S).map((c) => describe(c, days));
  }

  const api = { optimize, opportunities };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalOptimizer = api;
})(this);
