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
      halfDays: {}, // year -> memberId -> { date: 'am' | 'pm' } for booked half days
      titles: [], // { id, from, to, text, members } shown vertically over booked vacation
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

  // Everything that belongs to the household's plan and is shared via the
  // household link. Year, ticked people and the collapsed sidebar stay per device.
  const SHARED_KEYS = ['region', 'members', 'budgets', 'vacations', 'halfDays', 'titles', 'presets', 'opt'];

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
      window.KalSync.save(JSON.parse(json));
    }
  }

  function validShared(data) {
    return data && data.app === 'urlaubskalender' && Array.isArray(data.members) && data.members.length > 0;
  }

  // Replaces the plan with the shared one (joining a household, changes by others).
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
  let editing = null; // vacation entry being edited: { start, end, oldMembers, members }
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
  const HALF_LABEL = { am: 'vormittags', pm: 'nachmittags' };
  const countLabel = (n) => (n === 0 ? '0 Tage (frei, kein Urlaub)' : n === 0.5 ? '½ Urlaubstag' : '1 Urlaubstag');

  function presetWhat(p) {
    if (p.type === 'block') {
      const days = p.from === p.to ? mdLabel(p.from) : `${mdLabel(p.from)} – ${mdLabel(p.to)}`;
      if (p.half) return `Urlaub ${days}, ${HALF_LABEL[p.half]} (zählt ½ Tag)`;
      if (p.count === 0.5) return `Urlaub ${days} (zählt ½ Tag${p.from === p.to ? '' : ' pro Tag'})`;
      return `Urlaub ${days}`;
    }
    const day = p.rule ? D.CUSTOM_DAYS[p.rule]?.name || p.rule : mdLabel(p.date);
    return `${day} zählt ${countLabel(p.weight)}`;
  }

  // Vacation days charged for one day of a fixed-vacation preset.
  const blockUnit = (p) => (p.half ? 0.5 : p.count != null ? p.count : 1);

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
    // A preset counting a public holiday as ½ or 1 day makes it a working day
    // for that person (e.g. employer in a state without that holiday).
    const holidayOff = !!holiday && !(weightPreset && weightPreset.weight > 0);
    const free = weekend || holidayOff || weight === 0;
    // Cost when the day is off: fixed vacation can count less (half day, ½-rule).
    const unit = blockPreset ? Math.min(weight, blockUnit(blockPreset)) : weight;
    return { date, md, wd, weekend, holiday, weight, unit, weightPreset, blockPreset, free };
  }

  // Toggle tags for choosing people (same look as the tags on vacation entries).
  function personTags(ids, attr) {
    return state.members.map((m) => {
      const on = ids.includes(m.id);
      return `<button type="button" class="chip${on ? ' on' : ''}" style="--c:${m.color}" ${attr}="${m.id}" aria-pressed="${on}">${esc(m.name)}</button>`;
    }).join('');
  }

  function halfMap(year, memberId) { return { ...(state.halfDays[year]?.[memberId] || {}) }; }

  function storeHalf(year, memberId, map) {
    const byMember = state.halfDays[year] || (state.halfDays[year] = {});
    if (Object.keys(map).length) byMember[memberId] = map;
    else delete byMember[memberId];
    if (!Object.keys(byMember).length) delete state.halfDays[year];
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
    const halves = Object.fromEntries(state.members.map((m) => [m.id, halfMap(y, m.id)]));

    const days = [];
    const byDate = new Map();
    for (let i = 0; i < D.daysInYear(y); i++) {
      const date = D.addDays(D.iso(y, 1, 1), i);
      const per = {};
      for (const m of state.members) {
        const info = dayInfo(date, m.id);
        const manualVac = !info.free && manual[m.id].has(date);
        const presetVac = !info.free && !!info.blockPreset;
        const halfManual = manualVac ? halves[m.id][date] || null : null;
        const unit = halfManual ? Math.min(info.unit, 0.5) : info.unit;
        per[m.id] = { ...info, unit, manualVac, presetVac, halfManual, planned: manualVac || presetVac, cost: info.free ? 0 : unit };
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
        half: ps.some((p) => !p.free && p.unit > 0 && p.unit < 1),
        halfLabel: ps.map((p) => p.halfManual || (p.presetVac && p.blockPreset.half)).find(Boolean) || null,
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
    dropOrphanTitles();
    save();
    render();
  }

  // ---------- vacation titles ----------

  // A title stays while at least one of its people has vacation booked in its range.
  function titleVisible(t) {
    for (let d = t.from; d <= t.to; d = D.addDays(d, 1)) {
      if (t.members.some((id) => manualSet(+d.slice(0, 4), id).has(d))) return true;
    }
    return false;
  }

  function dropOrphanTitles() {
    if (state.titles.some((t) => !titleVisible(t))) state.titles = state.titles.filter(titleVisible);
  }

  // Titles to draw in the shown year: vacation titles plus named fixed-vacation presets.
  function titleRanges(year) {
    const list = state.titles.map((t) => ({ from: t.from, to: t.to, text: t.text }));
    for (const p of state.presets) {
      if (p.type !== 'block' || !p.active || !p.label) continue;
      if (!state.members.some((m) => appliesTo(p, m.id))) continue;
      const from = `${year}-${p.from}`, to = p.from <= p.to ? `${year}-${p.to}` : `${year + 1}-${p.to}`;
      list.push({ from, to, text: p.label });
      if (p.from > p.to) list.push({ from: `${year - 1}-${p.from}`, to: `${year}-${p.to}`, text: p.label });
    }
    const start = `${year}-01-01`, end = `${year}-12-31`;
    return list
      .filter((t) => t.to >= start && t.from <= end)
      .map((t) => ({ ...t, from: t.from < start ? start : t.from, to: t.to > end ? end : t.to }));
  }

  // Draws each title rotated in the middle of the month column over its days.
  // Positions are measured, so it runs again on resize and for printing.
  function drawTitles() {
    const cal = $('calendar');
    cal.querySelectorAll('.vtitle').forEach((el) => el.remove());
    cal.querySelectorAll('td.has-title').forEach((td) => td.classList.remove('has-title'));
    for (const t of titleRanges(state.year)) {
      let segStart = t.from;
      for (let d = t.from; d <= t.to; d = D.addDays(d, 1)) {
        const next = D.addDays(d, 1);
        if (d !== t.to && next.slice(5, 7) === d.slice(5, 7)) continue; // segment ends at month end
        const first = cal.querySelector(`td[data-date="${segStart}"]`);
        const last = cal.querySelector(`td[data-date="${d}"]`);
        if (first && last) {
          const height = last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
          const el = document.createElement('span');
          el.className = 'vtitle';
          el.textContent = t.text;
          el.style.height = `${height}px`;
          first.classList.add('has-title');
          first.appendChild(el);
        }
        segStart = next;
      }
    }
  }

  // Adds or removes every bookable workday between a and b (may span years)
  // for the given members. Returns the number of changed person-days.
  // `half` ('am' | 'pm') books half days; adding without it books full days.
  function setRange(a, b, add, memberIds = state.selected, half = null) {
    if (a > b) [a, b] = [b, a];
    let changed = 0;
    for (const id of memberIds) {
      const sets = new Map();
      const halves = new Map();
      for (let d = a; d <= b; d = D.addDays(d, 1)) {
        const y = +d.slice(0, 4);
        if (!sets.has(y)) { sets.set(y, manualSet(y, id)); halves.set(y, halfMap(y, id)); }
        const set = sets.get(y);
        const map = halves.get(y);
        if (add) {
          const info = dayInfo(d, id);
          if (info.free || info.blockPreset) continue;
          if (set.has(d) && (map[d] || null) === half) continue;
          set.add(d);
          if (half) map[d] = half;
          else delete map[d];
          changed++;
        } else if (set.delete(d)) {
          delete map[d];
          changed++;
        }
      }
      sets.forEach((set, y) => storeManual(y, id, set));
      halves.forEach((map, y) => storeHalf(y, id, map));
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

  function clearEntryForm() {
    $('range-from').value = '';
    $('range-to').value = '';
    $('range-extent').value = 'full';
    $('range-title').value = '';
  }

  // Loads a listed vacation entry into the form ("Urlaub bearbeiten").
  function startEdit(block) {
    const days = [];
    const extents = [];
    for (let d = block.start; d <= block.end; d = D.addDays(d, 1)) {
      const day = model.byDate.get(d);
      const booked = block.members.filter((id) => day.per[id].manualVac);
      if (!booked.length) continue;
      days.push(d);
      booked.forEach((id) => extents.push(day.per[id].halfManual || 'full'));
    }
    if (!days.length) return;
    const title = state.titles.find((t) => t.from <= block.end && t.to >= block.start
      && t.members.some((id) => block.members.includes(id)));
    editing = { start: block.start, end: block.end, oldMembers: [...block.members], members: [...block.members] };
    $('range-from').value = days[0];
    $('range-to').value = days[days.length - 1];
    $('range-extent').value = extents.every((x) => x === extents[0]) ? extents[0] : 'full';
    $('range-title').value = title ? title.text : '';
    render();
    $('range-from').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // People the entry form applies to: the entry being edited, or the "Für" tags.
  const entryMembers = () => (editing ? editing.members : state.selected);

  function rangeCost(a, b, memberId, half = null) {
    if (a > b) [a, b] = [b, a];
    // While editing, the entry's current days count as free to rebook.
    const ignore = editing && editing.oldMembers.includes(memberId) ? editing : null;
    let cost = 0;
    for (let d = a; d <= b; d = D.addDays(d, 1)) {
      const info = dayInfo(d, memberId);
      const booked = manualSet(+d.slice(0, 4), memberId).has(d) && !(ignore && d >= ignore.start && d <= ignore.end);
      if (!info.free && !info.blockPreset && !booked) {
        cost += half ? Math.min(info.weight, 0.5) : info.weight;
      }
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
    $('entry-who').hidden = !multi();
    $('entry-members').innerHTML = personTags(entryMembers(), 'data-entry-member');
    $('entry-title').textContent = editing ? 'Urlaub bearbeiten' : 'Urlaub eintragen';
    $('range-add').textContent = editing ? 'Speichern' : 'Eintragen';
    $('range-cancel').hidden = !editing;
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
        <i class="dot" style="background:${m.color}"></i>
        <input class="name" data-name="${m.id}" value="${esc(m.name)}" aria-label="Name">
        <input class="mbudget" type="number" min="0" step="0.5" data-budget="${m.id}" value="${budget(m.id)}" title="Urlaubsanspruch ${state.year}">
        ${multi() ? `<button type="button" class="link" data-member-delete="${m.id}" title="Person entfernen">✕</button>` : ''}
        <div class="sub${s.rest < 0 ? ' warn' : ''}">${num(s.used)} verplant · ${num(s.rest)} übrig · ${daysLabel(s.offDays)} frei am Stück</div>
      </li>`;
    }).join('');

    $('member-legend').innerHTML = multi()
      ? state.members.map((m) => `<li><i class="sw" style="background:${m.color}"></i>${esc(m.name)}</li>`).join('')
      : '';
    // Keep the choice made in the preset form (e.g. while editing); new people start chosen.
    const chosen = new Map([...$('preset-members').querySelectorAll('.chip')].map((el) => [el.dataset.presetMember, el.classList.contains('on')]));
    $('preset-members').innerHTML = personTags(state.members.filter((m) => chosen.get(m.id) !== false).map((m) => m.id), 'data-preset-member');
    $('preset-who').hidden = !multi();
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
    drawTitles();
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
      if (p.manualVac) title.push(`${who}Urlaub${p.halfManual ? `, ${HALF_LABEL[p.halfManual]} (½ Tag)` : ''}`);
      else if (p.presetVac) {
        const extra = [p.blockPreset.half && HALF_LABEL[p.blockPreset.half], p.unit < 1 && `zählt ${num(p.unit)} Tage`].filter(Boolean);
        title.push(`${who}Urlaub (Vorlage „${p.blockPreset.label || 'Vorlage'}“${extra.length ? `, ${extra.join(', ')}` : ''})`);
      }
    }
    if (sugg) title.push(`Vorschlag${multi() ? ` für ${names(suggestion.members)}` : ''}`);
    for (const t of titleRanges(state.year)) if (day.date >= t.from && day.date <= t.to) title.push(`„${t.text}“`);
    if (day.jointRun) title.push(`${daysLabel(day.jointRun)} frei am Stück`);

    const companyLabel = day.companyFree
      ? state.members.map((m) => day.per[m.id]).find((p) => p.weight === 0).weightPreset.label || 'frei'
      : '';
    const name = day.holiday || companyLabel || (day.halfLabel ? HALF_LABEL[day.halfLabel] : '');
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
          <div class="sub">${daysLabel(b.length)} frei · ${daysLabel(b.cost)} Urlaub${b.members.length > 1 ? ' je Person' : ''}
            ${b.presets.map((p) => `<span class="tag">${esc(p.label || 'Vorlage')}</span>`).join(' ')}</div>
          ${multi() ? chips(b, i) : ''}
        </div>
        ${b.manual ? `<button type="button" class="link" data-edit-block="${i}" title="Bearbeiten">✎</button>
        <button type="button" class="link" data-remove-block="${i}" title="Eingetragenen Urlaub entfernen">✕</button>` : ''}
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
      html += `<div class="sug-summary"><b>${daysLabel(cost)} Urlaub → ${daysLabel(gain)} frei</b>
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
        <div>${range(b.start, b.end)} <span class="ratio">${daysLabel(b.gain)} frei</span></div>
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
        <button type="button" class="link" data-preset-edit="${esc(p.id)}" title="Bearbeiten">✎</button>
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
    const half = $('range-extent').value === 'full' ? null : $('range-extent').value;
    const costs = state.members.filter((m) => entryMembers().includes(m.id)).map((m) => ({ m, cost: rangeCost(a, b, m.id, half) }));
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
    $('range-extent').addEventListener('change', updateRangePreview);

    // Who new vacation (form, calendar clicks, suggestions) is for.
    $('entry-members').addEventListener('click', (e) => {
      const id = e.target.closest('[data-entry-member]')?.dataset.entryMember;
      if (!id) return;
      if (editing) {
        if (editing.members.includes(id)) {
          if (editing.members.length === 1) { toast('Mindestens eine Person muss ausgewählt sein.'); return; }
          editing.members = editing.members.filter((x) => x !== id);
        } else {
          editing.members = state.members.map((m) => m.id).filter((x) => x === id || editing.members.includes(x));
        }
        render();
        return;
      }
      if (state.selected.includes(id)) {
        if (state.selected.length === 1) { toast('Mindestens eine Person muss ausgewählt sein.'); return; }
        state.selected = state.selected.filter((x) => x !== id);
      } else {
        state.selected = state.members.map((m) => m.id).filter((x) => x === id || state.selected.includes(x));
      }
      commit();
    });
    $('range-add').addEventListener('click', () => {
      const a = $('range-from').value, b = $('range-to').value || a;
      if (!a) { toast('Bitte ein Startdatum wählen.'); return; }
      const half = $('range-extent').value === 'full' ? null : $('range-extent').value;
      const text = $('range-title').value.trim();
      const [from, to] = a <= b ? [a, b] : [b, a];
      const members = [...entryMembers()];
      const wasEditing = !!editing;
      if (editing) {
        // Replace the entry: remove its days and its title, then book the new values.
        const old = editing;
        setRange(old.start, old.end, false, old.oldMembers);
        state.titles = state.titles.flatMap((t) => {
          if (!(t.from <= old.end && t.to >= old.start)) return [t];
          const rest = t.members.filter((id) => !old.oldMembers.includes(id));
          return rest.length ? [{ ...t, members: rest }] : [];
        });
        editing = null;
      }
      if (!setRange(a, b, true, members, half)) toast('Im Zeitraum gibt es keine Arbeitstage, die noch frei sind.');
      else if (wasEditing) toast('Urlaub geändert.');
      if (text) {
        // A new title for the same days replaces the old one.
        state.titles = state.titles.filter((t) => !(t.from === from && t.to === to));
        state.titles.push({ id: `t-${Date.now()}`, from, to, text, members });
      }
      clearEntryForm();
      commit();
    });

    $('range-cancel').addEventListener('click', () => {
      editing = null;
      clearEntryForm();
      render();
    });

    $('blocks').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit-block]');
      if (edit) { startEdit(model.blocks[+edit.dataset.editBlock]); return; }
      const chip = e.target.closest('[data-member]');
      if (chip) {
        toggleBlockMember(model.blocks[+chip.dataset.block], chip.dataset.member);
        return;
      }
      const btn = e.target.closest('[data-remove-block]');
      if (!btn) return;
      const b = model.blocks[+btn.dataset.removeBlock];
      if (editing) { editing = null; clearEntryForm(); }
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
    const form = $('preset-form');
    const details = form.closest('details');
    let editingId = null;
    form.rule.innerHTML = Object.entries(D.CUSTOM_DAYS)
      .map(([key, d]) => `<option value="${key}">${esc(d.name)}</option>`).join('');

    const syncFields = () => {
      form.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== form.type.value; });
      const half = form.extent.value !== 'full';
      if (half) form.blockCount.value = '0.5';
      form.blockCount.disabled = half;
    };
    const setMembers = (ids) => form.querySelectorAll('[data-preset-member]').forEach((el) => {
      const on = !ids || !ids.length || ids.includes(el.dataset.presetMember);
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', String(on));
    });
    $('preset-members').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-preset-member]');
      if (!chip) return;
      const on = !chip.classList.contains('on');
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    const setMode = (editing) => {
      $('preset-form-title').hidden = !editing;
      $('preset-cancel').hidden = !editing;
      form.querySelector('[type="submit"]').textContent = editing ? 'Speichern' : 'Hinzufügen';
    };
    const resetForm = () => {
      editingId = null;
      form.reset();
      setMembers(null);
      setMode(false);
      syncFields();
    };

    function editPreset(p) {
      resetForm();
      editingId = p.id;
      if (p.type === 'block') {
        form.type.value = 'block';
        form.from.value = mdLabel(p.from);
        form.to.value = p.to === p.from ? '' : mdLabel(p.to);
        form.extent.value = p.half || 'full';
        form.blockCount.value = String(blockUnit(p));
      } else if (p.rule) {
        form.type.value = 'custom';
        form.rule.value = p.rule;
        form.customWeight.value = String(p.weight);
      } else {
        form.type.value = 'weight';
        form.date.value = mdLabel(p.date);
        form.weight.value = String(p.weight);
      }
      form.label.value = p.label || '';
      setMembers(p.members);
      setMode(true);
      syncFields();
      details.open = true;
      form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    $('presets').addEventListener('click', (e) => {
      const editId = e.target.closest('[data-preset-edit]')?.dataset.presetEdit;
      if (editId) { editPreset(state.presets.find((x) => x.id === editId)); return; }
      const id = e.target.closest('[data-preset-delete]')?.dataset.presetDelete;
      if (!id) return;
      if (id === editingId) resetForm();
      state.presets = state.presets.filter((x) => x.id !== id);
      commit();
    });

    form.type.addEventListener('change', syncFields);
    form.extent.addEventListener('change', syncFields);
    $('preset-cancel').addEventListener('click', resetForm);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let label = form.label.value.trim();
      const checked = [...form.querySelectorAll('[data-preset-member].on')].map((el) => el.dataset.presetMember);
      if (!checked.length) { toast('Bitte mindestens eine Person auswählen.'); return; }
      // An empty list means "everybody", which also covers people added later.
      const members = checked.length === state.members.length ? [] : checked;
      let preset;
      if (form.type.value === 'block') {
        const from = parseMD(form.from.value), to = form.to.value.trim() ? parseMD(form.to.value) : from;
        if (!from || !to) { toast('Bitte Datum als TT.MM. angeben, z. B. 24.12.'); return; }
        const half = form.extent.value === 'full' ? null : form.extent.value;
        preset = { type: 'block', from, to, count: half ? 0.5 : +form.blockCount.value, label, members };
        if (half) preset.half = half;
      } else if (form.type.value === 'custom') {
        const rule = form.rule.value;
        // Default label follows the chosen day, also when the day is changed while editing.
        if (!label || Object.values(D.CUSTOM_DAYS).some((d) => d.name === label)) label = D.CUSTOM_DAYS[rule].name;
        preset = { type: 'weight', rule, weight: +form.customWeight.value, label, members };
      } else {
        const date = parseMD(form.date.value);
        if (!date) { toast('Bitte Datum als TT.MM. angeben, z. B. 24.12.'); return; }
        preset = { type: 'weight', date, weight: +form.weight.value, label, members };
      }
      const index = state.presets.findIndex((x) => x.id === editingId);
      if (index >= 0) state.presets[index] = { ...preset, id: editingId, active: state.presets[index].active };
      else state.presets.push({ ...preset, id: `p-${Date.now()}`, active: true });
      toast(index >= 0 ? 'Vorlage gespeichert.' : 'Vorlage hinzugefügt.');
      resetForm();
      details.open = false;
      commit();
    });

    $('print').addEventListener('click', () => window.print());
    bindSidebarToggle();
    bindCalendar();

    // Title positions depend on the rendered row heights.
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawTitles, 100); });
    window.addEventListener('beforeprint', drawTitles);
    window.addEventListener('afterprint', drawTitles);
    window.matchMedia('print').addEventListener?.('change', drawTitles);
    document.fonts?.ready.then(drawTitles);
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
      if (t.dataset.name) {
        const name = t.value.trim() || 'Person';
        // Re-rendering removes the focused input, which can fire another change.
        if (member(t.dataset.name).name === name) return;
        member(t.dataset.name).name = name;
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
      for (const y of Object.keys(state.halfDays)) storeHalf(y, id, {});
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

  // ---------- sharing via household link ----------

  function renderShare(info) {
    const box = $('share');
    box.hidden = !info.enabled;
    if (!info.enabled) return;
    const on = info.status !== 'off' && info.status !== 'deleted';
    box.querySelector('[data-when="off"]').hidden = on;
    box.querySelector('[data-when="on"]').hidden = !on;

    const notice = $('share-notice');
    notice.hidden = info.status !== 'deleted';
    notice.textContent = 'Der gemeinsame Plan wurde von jemandem gelöscht. Deine Kopie bleibt in diesem Browser.';

    const time = info.lastSync ? info.lastSync.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
    const el = $('share-status');
    el.className = `share-status${info.status === 'offline' || info.status === 'error' ? ' warn' : ''}`;
    el.innerHTML = {
      syncing: '🔗 <b>Gemeinsamer Plan</b> · wird abgeglichen …',
      synced: `🔗 <b>Gemeinsamer Plan</b> · abgeglichen ${time}`,
      offline: '⚠ Offline – Änderungen werden übertragen, sobald du wieder online bist.',
      error: '⚠ Der Speicherdienst ist gerade nicht erreichbar. Änderungen bleiben gespeichert und werden später übertragen.',
    }[info.status] || '';
    box.querySelector('[data-share="send"]').hidden = !navigator.share;
  }

  async function copyLink() {
    const url = window.KalSync.link();
    try {
      await navigator.clipboard.writeText(url);
      toast('Link kopiert. Schick ihn allen, die mitplanen sollen.');
    } catch (e) {
      prompt('Link zum gemeinsamen Plan:', url);
    }
  }

  async function shareAction(action) {
    const S = window.KalSync;
    try {
      if (action === 'create') {
        await S.create(sharedData());
        lastSharedJson = JSON.stringify(sharedData());
        toast('Der Plan wird jetzt geteilt. Schick den Link an alle, die mitplanen sollen.');
      } else if (action === 'send') {
        try {
          await navigator.share({ title: 'Urlaubskalender', text: 'Unser gemeinsamer Urlaubsplan', url: S.link() });
        } catch (e) {
          if (e.name !== 'AbortError') await copyLink();
        }
      } else if (action === 'copy') {
        await copyLink();
      } else if (action === 'leave') {
        if (!confirm('Auf diesem Gerät nicht mehr mitplanen? Dein Plan bleibt hier erhalten, Änderungen werden aber nicht mehr abgeglichen. Mit dem Link kannst du jederzeit wieder beitreten.')) return;
        S.leave();
        toast('Dieses Gerät plant jetzt wieder allein.');
      } else if (action === 'destroy') {
        if (!confirm('Den gemeinsamen Plan für alle löschen? Der Link funktioniert danach nicht mehr. Jeder behält nur die Kopie in seinem Browser.')) return;
        await S.destroy();
        toast('Der gemeinsame Plan wurde gelöscht.');
      }
    } catch (e) {
      toast(e.message || 'Das hat nicht geklappt.');
    }
  }

  async function handleInvite(key) {
    const member = !!window.KalSync.link();
    const question = member
      ? 'Du wurdest zu einem anderen gemeinsamen Urlaubsplan eingeladen. Wechseln? Der bisherige gemeinsame Plan wird auf diesem Gerät nicht mehr abgeglichen.'
      : 'Du wurdest zu einem gemeinsamen Urlaubsplan eingeladen. Beitreten? Der Plan auf diesem Gerät wird durch den gemeinsamen ersetzt.';
    if (!confirm(question)) return;
    try {
      const plan = await window.KalSync.join(key);
      if (!validShared(plan)) throw new Error('Der Link enthält keinen Urlaubsplan.');
      applyShared(plan);
      toast('Du planst jetzt gemeinsam. Änderungen werden automatisch abgeglichen.');
    } catch (e) {
      toast(e.message);
    }
  }

  function bindShare() {
    $('share').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-share]');
      if (btn) shareAction(btn.dataset.share);
    });
    lastSharedJson = JSON.stringify(sharedData());
    window.KalSync.init({
      getPlan: sharedData,
      onStatus: renderShare,
      onRemote: (plan, { conflict }) => {
        if (!validShared(plan)) return;
        applyShared(plan);
        if (conflict) toast('Jemand hat den Plan gleichzeitig geändert. Dessen Stand ist jetzt geladen – bitte deine letzte Änderung wiederholen.');
      },
    }).then(({ invite }) => {
      if (invite) handleInvite(invite);
    });
    renderShare(window.KalSync.info());
  }

  bind();
  bindShare();
  loadSchool();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
})();
