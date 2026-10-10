(function () {
  'use strict';

  const D = window.KalDates;
  const O = window.KalOptimizer;

  const STORE_KEY = 'urlaubskalender:v2';
  const DEFAULT_BUDGET = 30;
  const COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#65a30d', '#dc2626'];
  const STYLES = {
    short: { minLen: 3, maxLen: 9 },
    balanced: { minLen: 5, maxLen: 16 },
    long: { minLen: 9, maxLen: 23 },
  };
  // Presets without `members` apply to everybody.
  const DEFAULT_PRESETS = [
    { id: 'p-24', type: 'weight', date: '12-24', weight: 0.5, label: 'Heiligabend', active: true },
    { id: 'p-31', type: 'weight', date: '12-31', weight: 0.5, label: 'Silvester', active: true },
    { id: 'p-xmas', type: 'block', from: '12-24', to: '12-31', label: 'Zwischen den Jahren', active: true },
  ];

  // ---------- persistence ----------

  function defaultState() {
    const now = new Date();
    return {
      year: now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear(),
      region: 'NW',
      members: [{ id: 'm1', name: 'Ich', color: COLORS[0] }],
      selected: ['m1'],
      budgets: {}, // year -> memberId -> days
      vacations: {}, // year -> memberId -> sorted ISO dates of manually booked workdays
      presets: DEFAULT_PRESETS,
      opt: { style: 'balanced', maxBlocks: 0, school: 'any' },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const base = defaultState();
        return { ...base, ...saved, opt: { ...base.opt, ...saved.opt } };
      }
    } catch (e) { /* storage unavailable or corrupt */ }
    return defaultState();
  }

  // Everything that belongs to the household's plan and configuration.
  // Year, ticked people and the collapsed sidebar stay per device.
  const SHARED_KEYS = ['region', 'members', 'budgets', 'vacations', 'presets', 'opt'];

  function sharedData() {
    const data = { app: 'urlaubskalender', version: 1 };
    for (const k of SHARED_KEYS) data[k] = state[k];
    return data;
  }

  let lastSharedJson = null;
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    const json = JSON.stringify(sharedData());
    if (json !== lastSharedJson) {
      lastSharedJson = json;
      window.KalStorage.save(JSON.parse(json));
    }
  }

  function validShared(data) {
    return data && data.app === 'urlaubskalender' && Array.isArray(data.members) && data.members.length > 0;
  }

  // Replaces the household plan with data from a file (import, linked file, other person's change).
  function applyShared(data) {
    const regionChanged = data.region && data.region !== state.region;
    for (const k of SHARED_KEYS) if (data[k] !== undefined) state[k] = data[k];
    const ids = state.members.map((m) => m.id);
    state.selected = state.selected.filter((id) => ids.includes(id));
    if (!state.selected.length) state.selected = ids;
    lastSharedJson = JSON.stringify(sharedData());
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    suggestion = null;
    holidayCache.clear();
    render();
    if (regionChanged) loadSchool();
  }

  let state = load();
  let school = { list: [], source: 'loading' };
  let suggestion = null; // { blocks, opportunities, members }
  let model = null;

  // ---------- helpers ----------

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
  const fmt = (d) => `${d.slice(8)}.${d.slice(5, 7)}.`;
  const fmtWd = (d) => `${D.WEEKDAYS[D.weekday(d)]} ${fmt(d)}`;
  const mdLabel = (md) => `${md.slice(3)}.${md.slice(0, 2)}.`;
  const daysLabel = (n) => `${num(n)} ${n === 1 ? 'Tag' : 'Tage'}`;
  const range = (a, b) => (a === b ? fmtWd(a) : `${fmtWd(a)} – ${fmtWd(b)}`);
  const member = (id) => state.members.find((m) => m.id === id);
  const selected = () => state.members.filter((m) => state.selected.includes(m.id));
  const names = (ids) => ids.map((id) => member(id)?.name).filter(Boolean).join(', ');
  const multi = () => state.members.length > 1;

  function parseMD(s) {
    const m = /^\s*(\d{1,2})\.(\d{1,2})\.?\s*$/.exec(s || '');
    if (!m) return null;
    const d = +m[1], mo = +m[2];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const inMDRange = (md, from, to) => (from <= to ? md >= from && md <= to : md >= from || md <= to);
  const appliesTo = (preset, memberId) => !preset.members || !preset.members.length || preset.members.includes(memberId);

  function budget(memberId, year = state.year) {
    const b = state.budgets[year]?.[memberId];
    return b != null ? b : DEFAULT_BUDGET;
  }

  const holidayCache = new Map();
  function holidays(year) {
    const key = `${state.region}:${year}`;
    if (!holidayCache.has(key)) holidayCache.set(key, D.publicHolidays(year, state.region));
    return holidayCache.get(key);
  }

  const customCache = new Map();
  function customDate(rule, year) {
    const key = `${rule}:${year}`;
    if (!customCache.has(key)) customCache.set(key, D.CUSTOM_DAYS[rule]?.date(year) ?? null);
    return customCache.get(key);
  }

  // Short description of what a preset does.
  function presetWhat(p) {
    if (p.type === 'block') return `Urlaub ${mdLabel(p.from)} – ${mdLabel(p.to)}`;
    const day = p.rule ? D.CUSTOM_DAYS[p.rule]?.name || p.rule : mdLabel(p.date);
    return `${day} zählt ${p.weight === 0 ? '0 Tage (frei, kein Urlaub)' : '½ Urlaubstag'}`;
  }

  // A date as seen by one household member (presets can differ per person).
  function dayInfo(date, memberId) {
    const year = +date.slice(0, 4), md = date.slice(5);
    const wd = D.weekday(date);
    const active = state.presets.filter((p) => p.active && appliesTo(p, memberId));
    const weightPreset = active.find((p) => p.type === 'weight'
      && (p.rule ? customDate(p.rule, year) === date : p.date === md)) || null;
    const blockPreset = active.find((p) => p.type === 'block' && inMDRange(md, p.from, p.to)) || null;
    const weight = weightPreset ? weightPreset.weight : 1;
    const holiday = holidays(year).get(date) || null;
    const weekend = wd >= 5;
    const free = weekend || !!holiday || weight === 0;
    return { date, md, wd, weekend, holiday, weight, weightPreset, blockPreset, free };
  }

  function manualSet(year, memberId) { return new Set(state.vacations[year]?.[memberId] || []); }

  function storeManual(year, memberId, set) {
    const list = [...set].sort();
    const byMember = state.vacations[year] || (state.vacations[year] = {});
    if (list.length) byMember[memberId] = list;
    else delete byMember[memberId];
    if (!Object.keys(byMember).length) delete state.vacations[year];
  }

  // Maximal runs of days where off(day) holds and at least one day is booked(day).
  function findRuns(days, off, booked) {
    const runs = [];
    for (let i = 0; i < days.length;) {
      if (!off(days[i])) { i++; continue; }
      let j = i;
      while (j < days.length && off(days[j])) j++;
      if (days.slice(i, j).some(booked)) runs.push({ from: i, to: j - 1 });
      i = j;
    }
    return runs;
  }

  // ---------- model ----------

  function buildModel() {
    const y = state.year;
    const sel = selected();
    const schoolByDate = new Map();
    for (const h of school.list) {
      for (let d = h.start; d <= h.end; d = D.addDays(d, 1)) schoolByDate.set(d, h.name);
    }
    const manual = Object.fromEntries(state.members.map((m) => [m.id, manualSet(y, m.id)]));

    const days = [];
    const byDate = new Map();
    for (let i = 0; i < D.daysInYear(y); i++) {
      const date = D.addDays(D.iso(y, 1, 1), i);
      const per = {};
      for (const m of state.members) {
        const info = dayInfo(date, m.id);
        const manualVac = !info.free && manual[m.id].has(date);
        const presetVac = !info.free && !!info.blockPreset;
        per[m.id] = { ...info, manualVac, presetVac, planned: manualVac || presetVac, cost: info.free ? 0 : info.weight };
      }
      const base = dayInfo(date, null);
      const ps = sel.map((m) => per[m.id]);
      const free = ps.every((p) => p.free);
      const off = ps.every((p) => p.free || p.planned);
      const day = {
        date, index: i, wd: base.wd, weekend: base.weekend, holiday: base.holiday,
        school: schoolByDate.get(date) || null,
        per,
        // joint view of the selected members
        free,
        off,
        planned: off && !free,
        manualAny: ps.some((p) => p.manualVac),
        // Taking this day off together costs each person at most this much.
        cost: Math.max(0, ...ps.filter((p) => !p.free && !p.planned).map((p) => p.weight)),
        half: ps.some((p) => !p.free && p.weight > 0 && p.weight < 1),
        companyFree: !base.weekend && !base.holiday && ps.some((p) => p.weight === 0),
        jointRun: null,
      };
      days.push(day);
      byDate.set(date, day);
    }

    for (const r of findRuns(days, (d) => d.off, (d) => d.planned)) {
      const len = r.to - r.from + 1;
      for (let i = r.from; i <= r.to; i++) days[i].jointRun = len;
    }

    // Per-member breaks and usage
    const stats = {};
    const blocks = new Map(); // identical breaks of several people are listed once
    for (const m of state.members) {
      const isOff = (d) => d.per[m.id].free || d.per[m.id].planned;
      const runs = findRuns(days, isOff, (d) => d.per[m.id].planned);
      let used = 0;
      days.forEach((d) => { if (d.per[m.id].planned) used += d.per[m.id].cost; });
      stats[m.id] = { used, rest: budget(m.id) - used, offDays: runs.reduce((s, r) => s + r.to - r.from + 1, 0) };
      for (const r of runs) {
        const part = days.slice(r.from, r.to + 1).map((d) => d.per[m.id]);
        const cost = part.reduce((s, p) => s + (p.planned ? p.cost : 0), 0);
        const presets = [...new Set(part.filter((p) => p.presetVac && !p.manualVac).map((p) => p.blockPreset))];
        const manualDays = part.some((p) => p.manualVac);
        const key = `${r.from}|${r.to}|${cost}|${presets.map((p) => p.id).join()}|${manualDays}`;
        if (!blocks.has(key)) {
          blocks.set(key, {
            start: days[r.from].date, end: days[r.to].date, length: r.to - r.from + 1,
            cost, presets, manual: manualDays, members: [],
          });
        }
        blocks.get(key).members.push(m.id);
      }
    }
    const blockList = [...blocks.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    return { days, byDate, stats, blocks: blockList };
  }

  // ---------- mutations ----------

  function commit({ keepSuggestion = false } = {}) {
    if (!keepSuggestion) suggestion = null;
    save();
    render();
  }

  // Adds or removes every bookable workday between a and b (may span years)
  // for the given members. Returns the number of changed person-days.
  function setRange(a, b, add, memberIds = state.selected) {
    if (a > b) [a, b] = [b, a];
    let changed = 0;
    for (const id of memberIds) {
      const sets = new Map();
      for (let d = a; d <= b; d = D.addDays(d, 1)) {
        const y = +d.slice(0, 4);
        if (!sets.has(y)) sets.set(y, manualSet(y, id));
        const set = sets.get(y);
        if (add) {
          const info = dayInfo(d, id);
          if (info.free || info.blockPreset || set.has(d)) continue;
          set.add(d);
          changed++;
        } else if (set.delete(d)) {
          changed++;
        }
      }
      sets.forEach((set, y) => storeManual(y, id, set));
    }
    return changed;
  }

  // Adds or removes one person from a listed break. Booked days are copied or
  // deleted; for breaks that come from a preset, the preset's people change
  // (which applies to every year).
  function toggleBlockMember(block, memberId) {
    const add = !block.members.includes(memberId);
    const allIds = state.members.map((m) => m.id);
    for (const preset of block.presets) {
      const current = preset.members && preset.members.length ? preset.members : allIds;
      const next = add ? [...new Set([...current, memberId])] : current.filter((id) => id !== memberId);
      if (!next.length) preset.active = false;
      else preset.members = next.length === allIds.length ? [] : allIds.filter((id) => next.includes(id));
      toast(next.length
        ? `Vorlage „${preset.label || 'Vorlage'}“ gilt jetzt für ${names(next)} (jedes Jahr).`
        : `Vorlage „${preset.label || 'Vorlage'}“ gilt für niemanden mehr und wurde deaktiviert.`);
    }
    if (block.manual || !block.presets.length) setRange(block.start, block.end, add, [memberId]);
    commit();
  }

  function rangeCost(a, b, memberId) {
    if (a > b) [a, b] = [b, a];
    let cost = 0;
    for (let d = a; d <= b; d = D.addDays(d, 1)) {
      const info = dayInfo(d, memberId);
      if (!info.free && !info.blockPreset && !manualSet(+d.slice(0, 4), memberId).has(d)) cost += info.weight;
    }
    return cost;
  }

  // ---------- rendering ----------

  function render() {
    model = buildModel();
    const y = state.year;
    document.title = `Urlaubskalender ${y}`;
    $('year-label').textContent = y;
    $('title').textContent = `Urlaubskalender ${y}`;
    $('subtitle').textContent = `Schulferien und gesetzliche Feiertage in ${D.STATES[state.region]}`;
    $('region').value = state.region;
    $('range-from').min = `${y}-01-01`;
    $('range-to').min = `${y}-01-01`;
    $('sug-style').value = state.opt.style;
    $('sug-blocks').value = String(state.opt.maxBlocks);
    $('sug-school').value = state.opt.school;
    $('for-whom').textContent = multi() ? `für ${names(state.selected)}` : '';
    if (!suggestion) $('sug-budget').value = Math.max(0, jointRest());

    renderMembers();
    renderCalendar();
    renderBlocks();
    renderSuggestion();
    renderPresets();
    updateRangePreview();

    $('school-source').textContent = {
      loading: 'Schulferien werden geladen …',
      api: 'Schulferien: openholidaysapi.org',
      offline: 'Schulferien: eingebaute Daten (offline)',
      none: `Für ${y} sind noch keine Schulferien veröffentlicht.`,
    }[school.source];
  }

  const jointRest = () => Math.min(...state.selected.map((id) => model.stats[id].rest));

  function renderMembers() {
    $('members').innerHTML = state.members.map((m) => {
      const s = model.stats[m.id];
      return `<li>
        <input type="checkbox" data-select="${m.id}" ${state.selected.includes(m.id) ? 'checked' : ''} aria-label="${esc(m.name)} auswählen">
        <i class="dot" style="background:${m.color}"></i>
        <input class="name" data-name="${m.id}" value="${esc(m.name)}" aria-label="Name">
        <input class="mbudget" type="number" min="0" step="0.5" data-budget="${m.id}" value="${budget(m.id)}" title="Urlaubsanspruch ${state.year}">
        ${multi() ? `<button type="button" class="link" data-member-delete="${m.id}" title="Person entfernen">✕</button>` : ''}
        <div class="sub${s.rest < 0 ? ' warn' : ''}">${num(s.used)} verplant · ${num(s.rest)} übrig · ${s.offDays} Tage frei am Stück</div>
      </li>`;
    }).join('');

    $('member-legend').innerHTML = multi()
      ? state.members.map((m) => `<li><i class="sw" style="background:${m.color}"></i>${esc(m.name)}</li>`).join('')
      : '';
    $('preset-members').innerHTML = '<legend>Gilt für</legend>' + state.members.map((m) =>
      `<label><input type="checkbox" name="members" value="${m.id}" checked> ${esc(m.name)}</label>`).join('');
    $('preset-members').hidden = !multi();
  }

  function renderCalendar() {
    const y = state.year;
    const sugTaken = new Set();
    const sugRun = new Set();
    if (suggestion) {
      for (const b of suggestion.blocks) {
        b.taken.forEach((d) => sugTaken.add(d));
        for (let d = b.start; d <= b.end; d = D.addDays(d, 1)) sugRun.add(d);
      }
    }

    let html = '<thead><tr>' + D.MONTHS.map((m) => `<th>${m}</th>`).join('') + '</tr></thead><tbody>';
    for (let r = 1; r <= 31; r++) {
      html += '<tr>';
      for (let m = 1; m <= 12; m++) {
        const day = model.byDate.get(D.iso(y, m, r));
        html += day ? cellHtml(day, sugTaken.has(day.date), sugRun.has(day.date)) : '<td class="empty"></td>';
      }
      html += '</tr>';
    }
    $('calendar').innerHTML = html + '</tbody>';
  }

  function cellHtml(day, sugg, inSuggRun) {
    const cls = [];
    if (day.wd === 5) cls.push('sa');
    // Days off from presets (e.g. Rosenmontag) are cross-hatched like vacation;
    // lighter when only some of the selected people have them off.
    if (day.wd === 6 || day.holiday) cls.push('so');
    else if (day.companyFree) cls.push(day.free ? 'extra-free' : 'extra-free part');
    if (day.school) cls.push('school');
    if (day.planned) cls.push(day.manualAny ? 'vac' : 'vac-preset');
    if (sugg) cls.push('sugg');
    if (inSuggRun) cls.push('in-sugg-run');
    else if (day.jointRun) cls.push('in-run');

    // Off thanks to vacation or a person-specific free day (not weekends/holidays, which apply to all).
    const personOff = (m) => day.per[m.id].planned || (day.per[m.id].free && !day.weekend && !day.holiday);
    const onVacation = state.members.filter(personOff);
    const title = [`${D.WEEKDAYS_LONG[day.wd]}, ${fmt(day.date)}${day.date.slice(0, 4)}`];
    if (day.holiday) title.push(day.holiday);
    if (day.school) title.push(day.school);
    for (const m of state.members) {
      const p = day.per[m.id];
      const who = multi() ? `${m.name}: ` : '';
      if (p.weightPreset) title.push(`${who}${p.weightPreset.label || mdLabel(p.md)}${p.weight === 0 ? ' – frei' : ` zählt ${num(p.weight)} Tage`}`);
      if (p.manualVac) title.push(`${who}Urlaub`);
      else if (p.presetVac) title.push(`${who}Urlaub (Vorlage „${p.blockPreset.label}“)`);
    }
    if (sugg) title.push(`Vorschlag${multi() ? ` für ${names(suggestion.members)}` : ''}`);
    if (day.jointRun) title.push(`${day.jointRun} Tage frei am Stück`);

    const companyLabel = day.companyFree
      ? state.members.map((m) => day.per[m.id]).find((p) => p.weight === 0).weightPreset.label || 'frei'
      : '';
    const name = day.holiday || companyLabel;
    const showKw = day.wd === 0 || day.index === 0;
    const marks = multi() && onVacation.length
      ? '<span class="marks">' + state.members.map((m) =>
        `<i style="background:${personOff(m) ? m.color : 'transparent'}"></i>`).join('') + '</span>'
      : '';
    return `<td class="${cls.join(' ')}" data-date="${day.date}" title="${esc(title.join('\n'))}">`
      + `${day.date.slice(8)} ${D.WEEKDAYS[day.wd]}`
      + (showKw ? `<span class="kw">KW ${String(D.isoWeek(day.date)).padStart(2, '0')}</span>` : '')
      + (name ? `<span class="name">${esc(name)}</span>` : '')
      + (day.half ? '<span class="half">½</span>' : '')
      + marks
      + '</td>';
  }

  function renderBlocks() {
    if (!model.blocks.length) {
      $('blocks').innerHTML = '<li class="muted small">Noch kein Urlaub eingetragen.</li>';
      return;
    }
    const chips = (b, i) => '<div class="chips">' + state.members.map((m) => {
      const on = b.members.includes(m.id);
      return `<button type="button" class="chip${on ? ' on' : ''}" style="--c:${m.color}"
        data-block="${i}" data-member="${m.id}" aria-pressed="${on}"
        title="${esc(m.name)} ${on ? 'entfernen' : 'hinzufügen'}">${esc(m.name)}</button>`;
    }).join('') + '</div>';
    $('blocks').innerHTML = model.blocks.map((b, i) => `
      <li>
        <div>
          <div>${range(b.start, b.end)}</div>
          <div class="sub">${b.length} Tage frei · ${daysLabel(b.cost)} Urlaub${b.members.length > 1 ? ' je Person' : ''}
            ${b.presets.map((p) => `<span class="tag">${esc(p.label || 'Vorlage')}</span>`).join(' ')}</div>
          ${multi() ? chips(b, i) : ''}
        </div>
        ${b.manual ? `<button type="button" class="link" data-remove-block="${i}" title="Eingetragenen Urlaub entfernen">✕</button>` : ''}
      </li>`).join('');
  }

  function renderSuggestion() {
    const el = $('suggestion');
    if (!suggestion) { el.innerHTML = ''; return; }
    const { blocks, opportunities } = suggestion;
    const cost = blocks.reduce((s, b) => s + b.cost, 0);
    const gain = blocks.reduce((s, b) => s + b.gain, 0);

    let html = '';
    if (!blocks.length) {
      html += '<p class="sug-summary">Mit diesen Einstellungen passt kein Urlaubsblock ins Budget.</p>';
    } else {
      html += `<div class="sug-summary"><b>${daysLabel(cost)} Urlaub → ${gain} Tage frei</b>
        ${multi() ? `<div class="names">gemeinsam für ${esc(names(suggestion.members))}, höchstens ${daysLabel(cost)} je Person</div>` : ''}
        <div class="sug-actions">
          <button type="button" class="primary" data-sug-apply="all">Alle übernehmen</button>
          <button type="button" data-sug-discard>Verwerfen</button>
        </div></div>`;
      html += '<ul class="list">' + blocks.map((b, i) => blockItem(b, `data-sug-apply="${i}"`)).join('') + '</ul>';
    }
    if (opportunities.length) {
      html += '<h3>Brückentage &amp; Feiertags-Chancen</h3><ul class="list">'
        + opportunities.map((b, i) => blockItem(b, `data-opp-apply="${i}"`)).join('') + '</ul>';
    }
    el.innerHTML = html;
  }

  function blockItem(b, attr) {
    const takeFrom = b.taken[0], takeTo = b.taken[b.taken.length - 1];
    return `<li>
      <div>
        <div>${range(b.start, b.end)} <span class="ratio">${b.gain} Tage frei</span></div>
        <div class="sub">${daysLabel(b.cost)} Urlaub: ${range(takeFrom, takeTo)}</div>
      </div>
      <button type="button" ${attr}>Übernehmen</button>
    </li>`;
  }

  function renderPresets() {
    if (!state.presets.length) {
      $('presets').innerHTML = '<li class="muted small">Keine Vorlagen.</li>';
      return;
    }
    $('presets').innerHTML = state.presets.map((p) => {
      let what = presetWhat(p);
      if (p.label && what.startsWith(`${p.label} `)) what = what.slice(p.label.length + 1);
      const who = multi()
        ? (p.members && p.members.length ? names(p.members) : 'alle')
        : '';
      const sub = [p.label ? what : '', who].filter(Boolean).join(' · ');
      return `<li>
        <input type="checkbox" data-preset-toggle="${esc(p.id)}" ${p.active ? 'checked' : ''} aria-label="aktiv">
        <div><div>${esc(p.label || what)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
        <button type="button" class="link" data-preset-delete="${esc(p.id)}" title="Löschen">✕</button>
      </li>`;
    }).join('');
  }

  function updateRangePreview() {
    const a = $('range-from').value, b = $('range-to').value || a;
    if (!a) {
      $('range-preview').textContent = 'Oder im Kalender klicken bzw. mit der Maus ziehen.';
      return;
    }
    const costs = selected().map((m) => ({ m, cost: rangeCost(a, b, m.id) }));
    const same = costs.every((c) => c.cost === costs[0].cost);
    $('range-preview').textContent = same
      ? `Kostet ${daysLabel(costs[0].cost)} Urlaub${costs.length > 1 ? ' je Person' : ''}.`
      : `Kostet ${costs.map((c) => `${c.m.name} ${daysLabel(c.cost)}`).join(', ')}.`;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    // As a popover the toast sits in the top layer, above everything else.
    if (el.showPopover) {
      if (el.matches(':popover-open')) el.hidePopover();
      el.showPopover();
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), Math.max(2800, msg.length * 60));
  }

  // ---------- suggestion ----------

  // Plans shared time off for the selected members. The day cost is the
  // highest cost among them, and the budget is the smallest remaining one,
  // so nobody's entitlement is exceeded.
  function computeSuggestion() {
    const amount = parseFloat(String($('sug-budget').value).replace(',', '.'));
    if (!(amount > 0)) { toast('Bitte die Anzahl der zu verplanenden Tage angeben.'); return; }
    if (amount > jointRest()) toast(`Hinweis: Es sind nur noch ${daysLabel(jointRest())} übrig.`);
    const opts = { budget: amount, maxBlocks: state.opt.maxBlocks, school: state.opt.school, ...STYLES[state.opt.style] };
    const input = model.days.map((d) => ({
      free: d.free, planned: d.planned, cost: d.cost, school: !!d.school, weekend: d.weekend,
    }));
    const toDates = (b) => ({
      start: model.days[b.start].date,
      end: model.days[b.end].date,
      taken: b.taken.map((i) => model.days[i].date),
      cost: b.cost,
      gain: b.gain,
    });
    suggestion = {
      members: [...state.selected],
      blocks: O.optimize(input, opts).blocks.map(toDates),
      opportunities: O.opportunities(input, { ...opts, minLen: 3 }).map(toDates),
    };
    render();
    $('sug-budget').value = amount;
  }

  function applyBlocks(blocks) {
    for (const b of blocks) setRange(b.taken[0], b.taken[b.taken.length - 1], true, suggestion.members);
  }

  // ---------- events ----------

  function bind() {
    $('region').innerHTML = Object.entries(D.STATES)
      .map(([code, name]) => `<option value="${code}">${esc(name)}</option>`).join('');

    $('prev-year').addEventListener('click', () => changeYear(-1));
    $('next-year').addEventListener('click', () => changeYear(1));
    $('region').addEventListener('change', (e) => {
      state.region = e.target.value;
      holidayCache.clear();
      commit();
      loadSchool();
    });

    bindMembers();

    $('range-from').addEventListener('change', () => {
      if (!$('range-to').value || $('range-to').value < $('range-from').value) $('range-to').value = $('range-from').value;
      updateRangePreview();
    });
    $('range-to').addEventListener('change', updateRangePreview);
    $('range-add').addEventListener('click', () => {
      const a = $('range-from').value, b = $('range-to').value || a;
      if (!a) { toast('Bitte ein Startdatum wählen.'); return; }
      if (!setRange(a, b, true)) toast('Im Zeitraum gibt es keine Arbeitstage, die noch frei sind.');
      $('range-from').value = '';
      $('range-to').value = '';
      commit();
    });

    $('blocks').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-member]');
      if (chip) {
        toggleBlockMember(model.blocks[+chip.dataset.block], chip.dataset.member);
        return;
      }
      const btn = e.target.closest('[data-remove-block]');
      if (!btn) return;
      const b = model.blocks[+btn.dataset.removeBlock];
      setRange(b.start, b.end, false, b.members);
      commit();
    });

    const saveOpt = () => {
      state.opt = {
        style: $('sug-style').value,
        maxBlocks: +$('sug-blocks').value,
        school: $('sug-school').value,
      };
      save();
    };
    ['sug-style', 'sug-blocks', 'sug-school'].forEach((id) => $(id).addEventListener('change', saveOpt));
    $('sug-run').addEventListener('click', computeSuggestion);

    $('suggestion').addEventListener('click', (e) => {
      const apply = e.target.closest('[data-sug-apply]');
      const opp = e.target.closest('[data-opp-apply]');
      if (e.target.closest('[data-sug-discard]')) {
        suggestion = null;
        render();
      } else if (apply) {
        const key = apply.dataset.sugApply;
        if (key === 'all') {
          applyBlocks(suggestion.blocks);
          commit();
        } else {
          applyBlocks([suggestion.blocks[+key]]);
          suggestion.blocks.splice(+key, 1);
          suggestion.opportunities = [];
          commit({ keepSuggestion: suggestion.blocks.length > 0 });
        }
      } else if (opp) {
        applyBlocks([suggestion.opportunities[+opp.dataset.oppApply]]);
        commit();
      }
    });

    $('presets').addEventListener('change', (e) => {
      const id = e.target.dataset.presetToggle;
      const p = state.presets.find((x) => x.id === id);
      if (p) { p.active = e.target.checked; commit(); }
    });
    $('presets').addEventListener('click', (e) => {
      const id = e.target.closest('[data-preset-delete]')?.dataset.presetDelete;
      if (!id) return;
      state.presets = state.presets.filter((x) => x.id !== id);
      commit();
    });

    const form = $('preset-form');
    form.rule.innerHTML = Object.entries(D.CUSTOM_DAYS)
      .map(([key, d]) => `<option value="${key}">${esc(d.name)}</option>`).join('');
    form.type.addEventListener('change', () => {
      form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== form.type.value; });
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = `p-${Date.now()}`;
      const label = form.label.value.trim();
      const checked = [...form.querySelectorAll('input[name="members"]:checked')].map((el) => el.value);
      if (!checked.length) { toast('Bitte mindestens eine Person auswählen.'); return; }
      // An empty list means "everybody", which also covers people added later.
      const members = checked.length === state.members.length ? [] : checked;
      if (form.type.value === 'block') {
        const from = parseMD(form.from.value), to = parseMD(form.to.value || form.from.value);
        if (!from || !to) { toast('Bitte Datum als TT.MM. angeben, z. B. 24.12.'); return; }
        state.presets.push({ id, type: 'block', from, to, label, members, active: true });
      } else if (form.type.value === 'custom') {
        const rule = form.rule.value;
        state.presets.push({
          id, type: 'weight', rule, weight: +form.customWeight.value,
          label: label || D.CUSTOM_DAYS[rule].name, members, active: true,
        });
      } else {
        const date = parseMD(form.date.value);
        if (!date) { toast('Bitte Datum als TT.MM. angeben, z. B. 24.12.'); return; }
        state.presets.push({ id, type: 'weight', date, weight: +form.weight.value, label, members, active: true });
      }
      form.reset();
      form.type.dispatchEvent(new Event('change'));
      commit();
    });

    $('print').addEventListener('click', () => window.print());
    bindSidebarToggle();
    bindCalendar();
  }

  // Remembered per browser; purely a view preference, so it lives outside `state`.
  function bindSidebarToggle() {
    const KEY = 'urlaubskalender:sidebar-collapsed';
    const btn = $('sidebar-toggle');
    const apply = (collapsed) => {
      document.querySelector('.app').classList.toggle('collapsed', collapsed);
      btn.textContent = collapsed ? '»' : '«';
      btn.title = collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen';
      btn.setAttribute('aria-expanded', String(!collapsed));
    };
    let collapsed = false;
    try { collapsed = localStorage.getItem(KEY) === '1'; } catch (e) { /* ignore */ }
    apply(collapsed);
    btn.addEventListener('click', () => {
      collapsed = !collapsed;
      apply(collapsed);
      try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    });
  }

  function bindMembers() {
    const list = $('members');
    list.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.select) {
        const id = t.dataset.select;
        if (t.checked) state.selected = state.members.map((m) => m.id).filter((x) => x === id || state.selected.includes(x));
        else if (state.selected.length > 1) state.selected = state.selected.filter((x) => x !== id);
        else { t.checked = true; toast('Mindestens eine Person muss ausgewählt sein.'); return; }
        commit();
      } else if (t.dataset.name) {
        member(t.dataset.name).name = t.value.trim() || 'Person';
        commit({ keepSuggestion: true });
      } else if (t.dataset.budget) {
        const v = parseFloat(t.value);
        if (v >= 0) (state.budgets[state.year] || (state.budgets[state.year] = {}))[t.dataset.budget] = v;
        commit();
      }
    });
    list.addEventListener('click', (e) => {
      const id = e.target.closest('[data-member-delete]')?.dataset.memberDelete;
      if (!id || !confirm(`${member(id).name} und alle Einträge dieser Person löschen?`)) return;
      state.members = state.members.filter((m) => m.id !== id);
      state.selected = state.selected.filter((x) => x !== id);
      if (!state.selected.length) state.selected = [state.members[0].id];
      for (const y of Object.keys(state.vacations)) storeManual(y, id, new Set());
      for (const y of Object.keys(state.budgets)) delete state.budgets[y][id];
      // Drop presets that only applied to this person (an empty list would mean "everybody").
      state.presets = state.presets
        .filter((p) => !(p.members && p.members.length === 1 && p.members[0] === id))
        .map((p) => (p.members && p.members.length ? { ...p, members: p.members.filter((x) => x !== id) } : p));
      commit();
    });
    $('member-add').addEventListener('click', () => {
      const used = new Set(state.members.map((m) => m.color));
      const id = `m${Date.now()}`;
      state.members.push({
        id,
        name: `Person ${state.members.length + 1}`,
        color: COLORS.find((c) => !used.has(c)) || COLORS[state.members.length % COLORS.length],
      });
      state.selected.push(id);
      commit();
      list.querySelector(`[data-name="${id}"]`)?.select();
    });
  }

  // Click toggles a day; dragging with the mouse selects a range. Touch only taps,
  // so the table can still be scrolled sideways on phones.
  function bindCalendar() {
    const cal = $('calendar');
    let drag = null;

    const mark = () => {
      const [a, b] = drag.from <= drag.to ? [drag.from, drag.to] : [drag.to, drag.from];
      cal.querySelectorAll('td[data-date]').forEach((td) => {
        td.classList.toggle('selecting', td.dataset.date >= a && td.dataset.date <= b);
      });
    };

    cal.addEventListener('pointerdown', (e) => {
      const td = e.target.closest('td[data-date]');
      if (!td || e.button !== 0) return;
      if (e.pointerType === 'mouse') e.preventDefault();
      drag = { from: td.dataset.date, to: td.dataset.date, mouse: e.pointerType === 'mouse' };
      mark();
    });
    document.addEventListener('pointermove', (e) => {
      if (!drag || !drag.mouse) return;
      const td = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('td[data-date]');
      if (td && td.dataset.date !== drag.to) { drag.to = td.dataset.date; mark(); }
    });
    document.addEventListener('pointercancel', () => {
      drag = null;
      cal.querySelectorAll('.selecting').forEach((td) => td.classList.remove('selecting'));
    });
    document.addEventListener('pointerup', () => {
      if (!drag) return;
      const { from, to } = drag;
      drag = null;
      const first = model.byDate.get(from);
      const ps = state.selected.map((id) => first.per[id]);
      // Remove if every selected person is already off and at least one booked it by hand.
      const remove = first.off && ps.some((p) => p.manualVac);
      if (from === to && first.off && !remove) {
        toast(first.free
          ? `${fmt(from)} ist ohnehin frei${first.holiday ? ` (${first.holiday})` : ''}.`
          : `${fmt(from)} ist über eine Vorlage verplant.`);
        render();
        return;
      }
      setRange(from, to, !remove);
      commit();
    });
  }

  function changeYear(delta) {
    state.year += delta;
    commit();
    loadSchool();
  }

  let schoolRequest = 0;
  async function loadSchool() {
    const req = ++schoolRequest;
    school = { list: [], source: 'loading' };
    render();
    const result = await window.KalSchool.load(state.year, state.region);
    if (req !== schoolRequest) return; // year/region changed meanwhile
    school = result;
    render();
  }

  // ---------- settings: storage folder, backup, sharing ----------

  function renderStorage(info) {
    const S = window.KalStorage;
    const where = info.folder ? `${esc(info.folder)} › ${esc(info.file)}` : esc(info.file || '');
    const time = info.lastSaved
      ? ` · gespeichert ${info.lastSaved.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : '';

    $('storage-status').innerHTML = {
      none: 'Der Plan liegt nur in diesem Browser.',
      connected: `Gespeichert in <b>${where}</b>${time}`,
      'needs-permission': `Ablage <b>${where}</b> – der Browser braucht einmal deine Erlaubnis.`,
      error: `Ablage <b>${where}</b> ist nicht erreichbar (Ordner verschoben, umbenannt oder offline?).`,
    }[info.status];

    let actions = '';
    if (!S.supported) {
      $('storage-hint').textContent = 'Dieser Browser (Safari, Firefox, iPhone) kann keinen Ordner dauerhaft verknüpfen. '
        + 'Nutze hier Export und Import, oder öffne die App am Computer in Chrome oder Edge.';
    } else {
      $('storage-hint').textContent = `Im gewählten Ordner wird die Datei ${S.FILE_NAME} angelegt; jede Änderung wird sofort dort gespeichert. `
        + 'Der Browser merkt sich den Ordner auch nach einem Neustart.';
      if (info.status === 'needs-permission') actions += '<button type="button" class="primary" data-storage="grant">Zugriff erlauben</button>';
      actions += `<button type="button"${info.status === 'none' ? ' class="primary"' : ''} data-storage="choose">${info.status === 'none' ? 'Ordner wählen …' : 'Anderen Ordner wählen …'}</button>`;
      if (info.status !== 'none') actions += '<button type="button" data-storage="disconnect">Verknüpfung lösen</button>';
    }
    $('storage-actions').innerHTML = actions;

    // Always visible in the top card of the sidebar.
    const line = $('storage-line');
    line.className = `storage-line ${info.status}`;
    line.innerHTML = {
      none: 'Ablage: nur dieser Browser',
      connected: `Ablage: <b>${where}</b>`,
      'needs-permission': `Ablage: <b>${where}</b> – Zugriff erlauben`,
      error: `Ablage: <b>${where}</b> – nicht erreichbar`,
    }[info.status];

    // Header hint in case the sidebar is collapsed.
    $('storage-pill').hidden = info.status !== 'needs-permission' && info.status !== 'error';
    $('storage-pill').textContent = info.status === 'error' ? '⚠ Datenablage nicht erreichbar' : '⚠ Zugriff auf Datenablage erlauben';
  }

  function showSettings() {
    if (document.querySelector('.app').classList.contains('collapsed')) $('sidebar-toggle').click();
    const card = $('settings-card');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.remove('flash');
    void card.offsetWidth; // restart the highlight animation
    card.classList.add('flash');
  }

  async function storageAction(action) {
    const S = window.KalStorage;
    try {
      if (action === 'grant') {
        const data = await S.grantPermission();
        if (data && validShared(data)) applyShared(data);
        else if (S.info().status === 'connected') { lastSharedJson = null; save(); } // new/empty file: fill it
      } else if (action === 'choose') {
        const data = await S.chooseFolder(sharedData(), (existing, folder) => {
          if (!validShared(existing)) throw new Error(`${S.FILE_NAME} in „${folder}“ ist keine Urlaubskalender-Datei.`);
          return confirm(`Im Ordner „${folder}“ liegt bereits ein Urlaubsplan.\n\n`
            + 'OK: diesen Plan verwenden (ersetzt den Plan in diesem Browser).\nAbbrechen: Ordner nicht verknüpfen.');
        });
        if (data) {
          applyShared(data);
          toast('Verknüpft. Der Plan aus dem Ordner wird jetzt verwendet.');
        } else {
          toast(`Verknüpft. Der Plan wird ab jetzt in ${S.FILE_NAME} gespeichert.`);
        }
      } else if (action === 'disconnect') {
        await S.disconnect();
        toast('Verknüpfung gelöst. Der Plan bleibt in diesem Browser.');
      }
    } catch (e) {
      if (e.name !== 'AbortError') toast(`Das hat nicht geklappt: ${e.message}`);
    }
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(sharedData(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `urlaubskalender-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!validShared(data)) { toast('Das ist keine Urlaubskalender-Datei.'); return; }
      if (!confirm('Der aktuelle Plan wird durch den Inhalt der Datei ersetzt. Fortfahren?')) return;
      applyShared(data);
      lastSharedJson = null;
      save(); // also update a linked storage folder
      toast('Import abgeschlossen.');
    } catch (e) {
      toast('Die Datei konnte nicht gelesen werden.');
    }
  }

  function bindSettings() {
    $('storage-line').addEventListener('click', showSettings);
    $('storage-pill').addEventListener('click', showSettings);
    $('storage-actions').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-storage]');
      if (btn) storageAction(btn.dataset.storage);
    });
    $('export').addEventListener('click', exportFile);
    $('import').addEventListener('change', (e) => {
      if (e.target.files[0]) importFile(e.target.files[0]);
      e.target.value = '';
    });

    lastSharedJson = JSON.stringify(sharedData());
    window.KalStorage.init({
      onStatus: renderStorage,
      onExternalChange: (data, { conflict }) => {
        if (!validShared(data)) return;
        applyShared(data);
        toast(conflict
          ? 'Der Plan wurde inzwischen von jemand anderem geändert. Dessen Stand ist jetzt geladen – bitte deine letzte Änderung wiederholen.'
          : 'Änderungen aus der Datenablage übernommen.');
      },
    }).then((data) => {
      if (data && validShared(data)) applyShared(data);
      else if (window.KalStorage.info().status === 'connected' && !data) { lastSharedJson = null; save(); }
    });
    renderStorage(window.KalStorage.info());
  }

  bind();
  bindSettings();
  loadSchool();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
})();
