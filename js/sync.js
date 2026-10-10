// Household sync via the worker in worker/ (Cloudflare Worker + D1).
//
// A household is identified by a random 256-bit key that only lives in the
// household link (#k=…) and in this browser. The server gets a household id
// derived one-way from the key plus the plan encrypted with AES-GCM, so it can
// neither read the plan nor reconstruct the key.
//
// Changes are saved with the version they are based on. If somebody else saved
// in between, the server refuses (409) and their version is applied instead, so
// nothing gets overwritten silently. Changes made offline are kept and sent
// once the connection is back.
(function (root) {
  'use strict';

  const STORE_KEY = 'urlaubskalender:household';
  const POLL_MS = 15000;
  const SAVE_DELAY_MS = 600;
  const api = (root.KalConfig && root.KalConfig.syncUrl) || '';

  // ---------- encoding & crypto ----------

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function toB64url(bytes) {
    let s = '';
    new Uint8Array(bytes).forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromB64url(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }

  async function deriveId(keyBytes) {
    const input = new Uint8Array([...enc.encode('urlaubskalender:id:'), ...keyBytes]);
    return toB64url(await crypto.subtle.digest('SHA-256', input)).slice(0, 32);
  }

  const importKey = (keyBytes) => crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

  async function encrypt(cryptoKey, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(JSON.stringify(obj)));
    return toB64url(new Uint8Array([...iv, ...new Uint8Array(ct)]));
  }

  async function decrypt(cryptoKey, str) {
    const bytes = fromB64url(str);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, cryptoKey, bytes.slice(12));
    return JSON.parse(dec.decode(pt));
  }

  // ---------- state ----------

  let household = null; // { key, id, version, pending }
  let cryptoKey = null;
  let status = 'off'; // off | syncing | synced | offline | error | deleted
  let lastSync = null;
  let latest = null; // last plan handed to save()
  let callbacks = { onRemote: () => {}, onStatus: () => {} };

  function persist() {
    try {
      if (household) localStorage.setItem(STORE_KEY, JSON.stringify(household));
      else localStorage.removeItem(STORE_KEY);
    } catch (e) { /* ignore */ }
  }

  function setStatus(s) {
    status = s;
    callbacks.onStatus(info());
  }

  function info() {
    return { enabled: !!api, status, lastSync, link: link(), pending: !!(household && household.pending) };
  }

  function link() {
    if (!household) return null;
    return `${location.origin}${location.pathname}#k=${household.key}`;
  }

  async function use(key, version) {
    const keyBytes = fromB64url(key);
    if (keyBytes.length !== 32) throw new Error('Der Link ist unvollständig.');
    cryptoKey = await importKey(keyBytes);
    household = { key, id: await deriveId(keyBytes), version, pending: false };
  }

  // ---------- network ----------

  async function request(method, query = '', body) {
    const res = await fetch(`${api}/h/${household.id}${query}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, data };
  }

  // All network operations run one after another.
  let queue = Promise.resolve();
  const enqueue = (fn) => (queue = queue.then(fn, fn));

  function handleNetworkError(e) {
    setStatus(e instanceof TypeError ? 'offline' : 'error');
  }

  async function push() {
    if (!household || !household.pending) return;
    if (!latest && callbacks.getPlan) latest = callbacks.getPlan(); // pending from before a reload
    if (!latest) return;
    setStatus('syncing');
    try {
      const sent = latest;
      const res = await request('PUT', '', { version: household.version, data: await encrypt(cryptoKey, sent) });
      if (res.status === 200) {
        household.version = res.data.version;
        household.pending = latest !== sent; // changed again while sending
        persist();
        lastSync = new Date();
        setStatus('synced');
        if (household.pending) await push();
      } else if (res.status === 409) {
        household.version = res.data.version;
        household.pending = false;
        persist();
        lastSync = new Date();
        setStatus('synced');
        callbacks.onRemote(await decrypt(cryptoKey, res.data.data), { conflict: true });
      } else if (res.status === 404) {
        deleted();
      } else {
        setStatus('error');
      }
    } catch (e) {
      handleNetworkError(e);
    }
  }

  async function pull() {
    if (!household) return;
    try {
      const res = await request('GET', `?since=${household.version}`);
      if (res.status === 204) {
        lastSync = new Date();
        setStatus('synced');
      } else if (res.status === 200) {
        const theirs = await decrypt(cryptoKey, res.data.data);
        const conflict = household.pending;
        household.version = res.data.version;
        household.pending = false;
        persist();
        lastSync = new Date();
        setStatus('synced');
        callbacks.onRemote(theirs, { conflict });
      } else if (res.status === 404) {
        deleted();
      } else {
        setStatus('error');
      }
    } catch (e) {
      handleNetworkError(e);
    }
  }

  function deleted() {
    household = null;
    cryptoKey = null;
    persist();
    stopPolling();
    setStatus('deleted');
  }

  // ---------- polling ----------

  let timer = null;
  function tick() {
    if (!household || document.hidden) return;
    enqueue(() => (household && household.pending ? push() : pull()));
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(tick, POLL_MS);
  }

  function stopPolling() {
    clearInterval(timer);
    timer = null;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', tick);
    window.addEventListener('online', tick);
    document.addEventListener('visibilitychange', tick);
  }

  // ---------- public API ----------

  // Returns { invite } when the page was opened with a household link; the app
  // asks the user and then calls join(invite). The key is removed from the URL.
  async function init(cb) {
    callbacks = { ...callbacks, ...cb };
    let invite = null;
    const m = /(?:^|[#&])k=([A-Za-z0-9_-]{43})/.exec(location.hash);
    if (m) {
      invite = m[1];
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (!api) return { invite: null };

    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (stored && stored.key) {
        await use(stored.key, stored.version || 0);
        household.pending = !!stored.pending;
      }
    } catch (e) {
      household = null;
    }

    if (invite && household && invite === household.key) invite = null; // already a member
    if (household) {
      startPolling();
      tick();
    }
    setStatus(household ? 'syncing' : 'off');
    return { invite };
  }

  // Starts sharing the current plan; returns the household link.
  function create(plan) {
    return enqueue(async () => {
      const keyBytes = crypto.getRandomValues(new Uint8Array(32));
      await use(toB64url(keyBytes), 0);
      latest = plan;
      household.pending = true;
      setStatus('syncing');
      const res = await request('PUT', '', { version: 0, data: await encrypt(cryptoKey, plan) });
      if (res.status !== 200) {
        household = null;
        cryptoKey = null;
        setStatus('off');
        throw new Error('Der Speicherdienst hat nicht geantwortet.');
      }
      household.version = res.data.version;
      household.pending = false;
      persist();
      lastSync = new Date();
      setStatus('synced');
      startPolling();
      return link();
    }).catch((e) => {
      if (e instanceof TypeError) { household = null; setStatus('off'); throw new Error('Keine Verbindung zum Speicherdienst.'); }
      throw e;
    });
  }

  // Joins a household from its link key; returns the shared plan.
  function join(key) {
    return enqueue(async () => {
      const previous = household;
      await use(key, 0);
      let res;
      try {
        res = await request('GET');
      } catch (e) {
        household = previous;
        throw new Error('Keine Verbindung zum Speicherdienst.');
      }
      if (res.status === 404) { household = previous; throw new Error('Diesen gemeinsamen Plan gibt es nicht mehr.'); }
      if (res.status !== 200) { household = previous; throw new Error('Der Speicherdienst hat nicht geantwortet.'); }
      let plan;
      try {
        plan = await decrypt(cryptoKey, res.data.data);
      } catch (e) {
        household = previous;
        throw new Error('Der Link passt nicht zu diesem Plan.');
      }
      household.version = res.data.version;
      persist();
      lastSync = new Date();
      setStatus('synced');
      startPolling();
      return plan;
    });
  }

  function save(plan) {
    if (!household) return;
    latest = plan;
    household.pending = true;
    persist();
    clearTimeout(save.timer);
    save.timer = setTimeout(() => enqueue(push), SAVE_DELAY_MS);
  }

  // Stops syncing on this device; the plan stays in this browser.
  function leave() {
    stopPolling();
    household = null;
    cryptoKey = null;
    persist();
    setStatus('off');
  }

  // Deletes the shared plan on the server for everybody.
  function destroy() {
    return enqueue(async () => {
      if (!household) return;
      const res = await request('DELETE', `?version=${household.version}`);
      if (res.status === 409) {
        await pull();
        throw new Error('Inzwischen hat jemand etwas geändert. Bitte noch einmal versuchen.');
      }
      leave();
    });
  }

  root.KalSync = { init, info, create, join, save, leave, destroy, link };
})(this);
