// School holidays from openholidaysapi.org, cached in localStorage, with a
// built-in fallback for NRW so the calendar also works offline.
(function (root) {
  'use strict';

  const FALLBACK = {
    NW: [
      ['2024-12-23', '2025-01-06', 'Weihnachtsferien'],
      ['2025-04-14', '2025-04-26', 'Osterferien'],
      ['2025-06-10', '2025-06-10', 'Pfingstferien'],
      ['2025-07-14', '2025-08-26', 'Sommerferien'],
      ['2025-10-13', '2025-10-25', 'Herbstferien'],
      ['2025-12-22', '2026-01-06', 'Weihnachtsferien'],
      ['2026-03-30', '2026-04-11', 'Osterferien'],
      ['2026-05-26', '2026-05-26', 'Pfingstferien'],
      ['2026-07-20', '2026-09-01', 'Sommerferien'],
      ['2026-10-17', '2026-10-31', 'Herbstferien'],
      ['2026-12-23', '2027-01-06', 'Weihnachtsferien'],
      ['2027-03-22', '2027-04-03', 'Osterferien'],
      ['2027-05-18', '2027-05-18', 'Pfingstferien'],
      ['2027-07-19', '2027-08-31', 'Sommerferien'],
      ['2027-10-23', '2027-11-06', 'Herbstferien'],
      ['2027-12-24', '2028-01-08', 'Weihnachtsferien'],
      ['2028-04-10', '2028-04-22', 'Osterferien'],
      ['2028-07-10', '2028-08-22', 'Sommerferien'],
      ['2028-10-23', '2028-11-04', 'Herbstferien'],
      ['2028-12-21', '2029-01-05', 'Weihnachtsferien'],
      ['2029-03-26', '2029-04-07', 'Osterferien'],
      ['2029-05-22', '2029-05-22', 'Pfingstferien'],
      ['2029-07-02', '2029-08-14', 'Sommerferien'],
      ['2029-10-15', '2029-10-27', 'Herbstferien'],
      ['2029-12-20', '2030-01-04', 'Weihnachtsferien'],
    ],
  };

  const cacheKey = (state, year) => `urlaubskalender:school:${state}:${year}`;

  function fallback(state, year) {
    const from = `${year}-01-01`, to = `${year}-12-31`;
    return (FALLBACK[state] || [])
      .filter(([start, end]) => end >= from && start <= to)
      .map(([start, end, name]) => ({ start, end, name }));
  }

  async function load(year, state) {
    try {
      const cached = localStorage.getItem(cacheKey(state, year));
      if (cached) return { list: JSON.parse(cached), source: 'api' };
    } catch (e) { /* storage unavailable */ }

    try {
      const url = 'https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&languageIsoCode=DE'
        + `&subdivisionCode=DE-${state}&validFrom=${year}-01-01&validTo=${year}-12-31`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = data.map((h) => ({
        start: h.startDate,
        end: h.endDate,
        name: (h.name.find((n) => n.language === 'DE') || h.name[0]).text,
      }));
      // Empty results usually mean "not published yet" – don't cache those.
      if (list.length) {
        try { localStorage.setItem(cacheKey(state, year), JSON.stringify(list)); } catch (e) { /* ignore */ }
      }
      return { list, source: list.length ? 'api' : 'none' };
    } catch (e) {
      const list = fallback(state, year);
      return { list, source: list.length ? 'offline' : 'none' };
    }
  }

  root.KalSchool = { load };
})(this);
