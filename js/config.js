// Address of the sync service (worker/). Without it, sharing is hidden and the
// plan stays in this browser only.
window.KalConfig = {
  syncUrl: location.hostname === 'localhost' ? 'http://localhost:8787' : '',
};
