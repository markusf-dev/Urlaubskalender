// Date helpers and German public holidays. All dates are ISO strings (YYYY-MM-DD)
// handled in UTC so DST never shifts a day.
(function (root) {
  'use strict';

  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
    'September', 'Oktober', 'November', 'Dezember'];

  const STATES = {
    BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen',
    HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen',
    NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen',
    ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
  };

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  function toDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const fromDate = (dt) => iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());

  function addDays(s, n) {
    const dt = toDate(s);
    dt.setUTCDate(dt.getUTCDate() + n);
    return fromDate(dt);
  }

  // 0 = Monday … 6 = Sunday
  const weekday = (s) => (toDate(s).getUTCDay() + 6) % 7;

  function isoWeek(s) {
    const thursday = toDate(s);
    thursday.setUTCDate(thursday.getUTCDate() - weekday(s) + 3);
    const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
    return Math.floor((thursday - jan1) / 864e5 / 7) + 1;
  }

  const daysInYear = (y) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);

  // Anonymous Gregorian algorithm
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return iso(y, month, day);
  }

  // Statewide holidays only; holidays limited to single municipalities
  // (e.g. Mariä Himmelfahrt in parts of Bayern) are not included.
  function publicHolidays(year, state) {
    const map = new Map();
    const E = easter(year);
    const add = (date, name, states) => {
      if (!states || states.includes(state)) map.set(date, name);
    };
    add(iso(year, 1, 1), 'Neujahr');
    add(iso(year, 1, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']);
    if (year >= 2019) add(iso(year, 3, 8), 'Frauentag', year >= 2023 ? ['BE', 'MV'] : ['BE']);
    add(addDays(E, -2), 'Karfreitag');
    add(E, 'Ostersonntag', ['BB']);
    add(addDays(E, 1), 'Ostermontag');
    add(iso(year, 5, 1), 'Tag der Arbeit');
    add(addDays(E, 39), 'Christi Himmelfahrt');
    add(addDays(E, 49), 'Pfingstsonntag', ['BB']);
    add(addDays(E, 50), 'Pfingstmontag');
    add(addDays(E, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
    add(iso(year, 8, 15), 'Mariä Himmelfahrt', ['SL']);
    if (year >= 2019) add(iso(year, 9, 20), 'Weltkindertag', ['TH']);
    add(iso(year, 10, 3), 'Tag der Deutschen Einheit');
    add(iso(year, 10, 31), 'Reformationstag', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']);
    add(iso(year, 11, 1), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']);
    if (state === 'SN') add(bussUndBettag(year), 'Buß- und Bettag');
    add(iso(year, 12, 25), '1. Weihnachtsfeiertag');
    add(iso(year, 12, 26), '2. Weihnachtsfeiertag');
    return map;
  }

  function bussUndBettag(year) {
    let d = iso(year, 11, 22);
    while (weekday(d) !== 2) d = addDays(d, -1);
    return d;
  }

  // Customary days (Brauchtumstage) and holidays that only apply regionally.
  // Employers often grant them off; they can be picked as presets.
  const CUSTOM_DAYS = {
    weiberfastnacht: { name: 'Weiberfastnacht', date: (y) => addDays(easter(y), -52) },
    rosenmontag: { name: 'Rosenmontag', date: (y) => addDays(easter(y), -48) },
    veilchendienstag: { name: 'Veilchendienstag', date: (y) => addDays(easter(y), -47) },
    aschermittwoch: { name: 'Aschermittwoch', date: (y) => addDays(easter(y), -46) },
    gruendonnerstag: { name: 'Gründonnerstag', date: (y) => addDays(easter(y), -3) },
    fronleichnam: { name: 'Fronleichnam', date: (y) => addDays(easter(y), 60) },
    friedensfest: { name: 'Augsburger Friedensfest', date: (y) => iso(y, 8, 8) },
    mariaehimmelfahrt: { name: 'Mariä Himmelfahrt', date: (y) => iso(y, 8, 15) },
    reformationstag: { name: 'Reformationstag', date: (y) => iso(y, 10, 31) },
    allerheiligen: { name: 'Allerheiligen', date: (y) => iso(y, 11, 1) },
    martinstag: { name: 'Martinstag', date: (y) => iso(y, 11, 11) },
    bussundbettag: { name: 'Buß- und Bettag', date: bussUndBettag },
  };

  const api = {
    WEEKDAYS, WEEKDAYS_LONG, MONTHS, STATES, CUSTOM_DAYS,
    iso, toDate, addDays, weekday, isoWeek, daysInYear, easter, publicHolidays,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KalDates = api;
})(this);
