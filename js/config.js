// Address of the sync service (worker/). Without it, sharing is hidden and the
// plan stays in this browser only. On localhost the local dev service is used
// (`npm run dev` in worker/).
window.KalConfig = window.KalConfig || {
  syncUrl: location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://urlaubskalender-sync.mstuff.workers.dev',
};
