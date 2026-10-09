// Optional data file on disk (File System Access API, Chrome/Edge desktop).
// The file handle is kept in IndexedDB so the link survives reloads; the
// browser may ask again for permission after a restart.
// If the file lives in a shared cloud folder (iCloud Drive, Dropbox, OneDrive),
// several people can work on the same plan: changes by others are picked up
// by polling the file's modification time.
(function (root) {
  'use strict';

  const DB = 'urlaubskalender';
  const STORE = 'handles';
  const KEY = 'datafile';
  const POLL_MS = 5000;

  const supported = typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'indexedDB' in window;

  let handle = null;
  let lastModified = 0;
  let status = 'none'; // none | connected | needs-permission | error
  let lastSaved = null;
  let onExternalChange = () => {};
  let onStatus = () => {};

  // ---------- IndexedDB ----------

  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => { open.result.close(); resolve(req && req.result); };
        tx.onerror = () => { open.result.close(); reject(tx.error); };
      };
    });
  }

  const loadHandle = () => idb('readonly', (s) => s.get(KEY));
  const storeHandle = (h) => idb('readwrite', (s) => (h ? s.put(h, KEY) : s.delete(KEY)));

  // ---------- file access ----------

  function setStatus(s) {
    status = s;
    onStatus(info());
  }

  function info() {
    return { supported, status, name: handle ? handle.name : null, lastSaved };
  }

  async function readFile() {
    const file = await handle.getFile();
    lastModified = file.lastModified;
    const text = await file.text();
    return text.trim() ? JSON.parse(text) : null;
  }

  async function writeFile(data) {
    const w = await handle.createWritable();
    await w.write(JSON.stringify(data, null, 2));
    await w.close();
    lastModified = (await handle.getFile()).lastModified;
    lastSaved = new Date();
  }

  // Restores the link from a previous visit. Returns the file's data when
  // access is still granted, otherwise null (status tells why).
  async function init(callbacks) {
    onExternalChange = callbacks.onExternalChange || onExternalChange;
    onStatus = callbacks.onStatus || onStatus;
    if (!supported) { setStatus('none'); return null; }
    try {
      handle = await loadHandle();
    } catch (e) {
      handle = null;
    }
    if (!handle) { setStatus('none'); return null; }
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      setStatus('needs-permission');
      return null;
    }
    return connectExisting();
  }

  async function connectExisting() {
    try {
      const data = await readFile();
      setStatus('connected');
      startPolling();
      return data;
    } catch (e) {
      setStatus('error');
      return null;
    }
  }

  // Must be called from a click (browser requirement).
  async function grantPermission() {
    if (!handle) return null;
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
    return connectExisting();
  }

  // Creates a new file and writes the current data into it.
  async function createFile(data) {
    const h = await window.showSaveFilePicker({
      suggestedName: 'urlaubskalender.json',
      types: [{ description: 'Urlaubskalender', accept: { 'application/json': ['.json'] } }],
    });
    handle = h;
    await storeHandle(h);
    await writeFile(data);
    setStatus('connected');
    startPolling();
  }

  // Links an existing file and returns its data (which replaces the local plan).
  async function openFile() {
    const [h] = await window.showOpenFilePicker({
      types: [{ description: 'Urlaubskalender', accept: { 'application/json': ['.json'] } }],
    });
    if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Kein Schreibzugriff');
    handle = h;
    await storeHandle(h);
    const data = await readFile();
    setStatus('connected');
    startPolling();
    return data;
  }

  async function disconnect() {
    stopPolling();
    handle = null;
    lastSaved = null;
    await storeHandle(null);
    setStatus('none');
  }

  // Writes the data unless someone else changed the file since we last read
  // it; in that case their version is handed to onExternalChange instead, so
  // nothing gets overwritten silently.
  let writing = Promise.resolve();
  function save(data) {
    if (status !== 'connected') return writing;
    writing = writing.then(async () => {
      try {
        const file = await handle.getFile();
        if (file.lastModified !== lastModified) {
          const theirs = await readFile();
          if (theirs) { onExternalChange(theirs, { conflict: true }); return; }
        }
        await writeFile(data);
        onStatus(info());
      } catch (e) {
        setStatus('error');
      }
    });
    return writing;
  }

  // ---------- watching for changes by others ----------

  let timer = null;
  async function check() {
    if (status !== 'connected' || document.hidden) return;
    try {
      await writing;
      const file = await handle.getFile();
      if (file.lastModified !== lastModified) {
        const data = await readFile();
        if (data) onExternalChange(data, { conflict: false });
      }
    } catch (e) { /* file temporarily unavailable, e.g. while the cloud client syncs */ }
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(check, POLL_MS);
    window.addEventListener('focus', check);
  }

  function stopPolling() {
    clearInterval(timer);
    window.removeEventListener('focus', check);
  }

  root.KalStorage = { supported, init, info, grantPermission, createFile, openFile, disconnect, save };
})(this);
