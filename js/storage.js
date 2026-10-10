// Optional storage folder (File System Access API, Chrome/Edge desktop).
// The user picks a folder in the Finder/Explorer dialog; the plan is kept in
// urlaubskalender.json inside it. The folder handle is stored in IndexedDB so
// the browser remembers the location; after a restart it may ask once more
// for permission (one click).
// If the folder is shared via iCloud Drive, Dropbox or OneDrive, everybody who
// picks it works on the same plan: changes by others are picked up by polling
// the file's modification time.
(function (root) {
  'use strict';

  const FILE_NAME = 'urlaubskalender.json';
  const DB = 'urlaubskalender';
  const STORE = 'handles';
  const KEY = 'datafile';
  const POLL_MS = 5000;

  const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window && 'indexedDB' in window;

  let dir = null; // folder handle (null for links made by older versions)
  let handle = null; // file handle
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

  const loadRecord = () => idb('readonly', (s) => s.get(KEY));
  const storeRecord = (rec) => idb('readwrite', (s) => (rec ? s.put(rec, KEY) : s.delete(KEY)));

  // ---------- file access ----------

  function setStatus(s) {
    status = s;
    onStatus(info());
  }

  function info() {
    return {
      supported,
      status,
      folder: dir ? dir.name : null,
      file: handle ? handle.name : (dir ? FILE_NAME : null),
      lastSaved,
    };
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

  const permissionTarget = () => dir || handle;

  // Restores the location from a previous visit. Returns the plan stored there
  // when access is still granted, otherwise null (status tells why).
  async function init(callbacks) {
    onExternalChange = callbacks.onExternalChange || onExternalChange;
    onStatus = callbacks.onStatus || onStatus;
    if (!supported) { setStatus('none'); return null; }
    let rec = null;
    try { rec = await loadRecord(); } catch (e) { /* ignore */ }
    if (!rec) { setStatus('none'); return null; }
    if (rec.kind === 'file') { dir = null; handle = rec; } // linked by an older version
    else { dir = rec.dir; handle = null; }
    if ((await permissionTarget().queryPermission({ mode: 'readwrite' })) !== 'granted') {
      setStatus('needs-permission');
      return null;
    }
    return connect();
  }

  async function connect() {
    try {
      if (dir) handle = await dir.getFileHandle(FILE_NAME, { create: true });
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
    const target = permissionTarget();
    if (!target) return null;
    if ((await target.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
    return connect();
  }

  // Opens the folder dialog. If the folder already holds a plan, confirmUse(plan)
  // decides whether to use it (returning it, it replaces the local plan) or to
  // cancel. Otherwise `current` is written into a new file and null is returned.
  async function chooseFolder(current, confirmUse) {
    const d = await window.showDirectoryPicker({ id: 'urlaubskalender', mode: 'readwrite' });
    const f = await d.getFileHandle(FILE_NAME, { create: true });
    const text = await (await f.getFile()).text();
    let existing = null;
    if (text.trim()) {
      try { existing = JSON.parse(text); } catch (e) { throw new Error(`${FILE_NAME} in „${d.name}“ ist beschädigt.`); }
      if (!confirmUse(existing, d.name)) {
        const abort = new Error('abgebrochen');
        abort.name = 'AbortError';
        throw abort;
      }
    }
    stopPolling();
    dir = d;
    handle = f;
    await storeRecord({ kind: 'folder', dir: d });
    if (existing) {
      lastModified = (await f.getFile()).lastModified;
    } else {
      await writeFile(current);
    }
    setStatus('connected');
    startPolling();
    return existing;
  }

  async function disconnect() {
    stopPolling();
    dir = null;
    handle = null;
    lastSaved = null;
    await storeRecord(null);
    setStatus('none');
  }

  // Writes the plan unless someone else changed the file since we last read
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

  root.KalStorage = { supported, FILE_NAME, init, info, grantPermission, chooseFolder, disconnect, save };
})(this);
