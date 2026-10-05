/**
 * storage.js
 * PEA Construction & Disbursement Dashboard
 * Hybrid persistence engine:
 * 1. Central data files in /data (served by server.py on the LAN, or by Vercel after `git push`)
 * 2. IndexedDB & localStorage (fast local cache & offline / public-site personal uploads)
 *
 * Reads always use the static files in /data so they work on BOTH the local server and Vercel.
 * Writes use the server.py API (only available when the page is opened from server.py).
 */

window.DashboardStorage = (function () {
  'use strict';

  const DB_NAME = 'PEA_Dashboard_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'dashboard_state';
  const RECORD_KEY = 'latest_uploaded_data';
  const LOCAL_STORAGE_KEY = 'pea_dashboard_latest_data';
  const PREFS_STORAGE_KEY = 'pea_dashboard_preferences';

  const isHttp = window.location.protocol.startsWith('http');
  let dbPromise = null;
  let serverInfoPromise = null;

  // ---------------------------------------------------------------- helpers
  function bust(url) {
    return `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`;
  }

  async function fetchJson(url) {
    if (!isHttp) return null;
    try {
      const res = await fetch(bust(url), { cache: 'no-store' });
      if (!res.ok) return null;
      const type = res.headers.get('content-type') || '';
      if (!type.includes('json')) return null; // e.g. Vercel 404 HTML page
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function isDataset(obj) {
    return !!(obj && (obj.transmissionLines || obj.substationsDetail));
  }

  // ------------------------------------------------------------ IndexedDB
  function getDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function idbRequest(mode, fn) {
    const db = await getDB();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], mode);
      const req = fn(tx.objectStore(STORE_NAME));
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveToLocal(payload) {
    if (!payload) return;
    try { await idbRequest('readwrite', s => s.put(payload, RECORD_KEY)); } catch (e) { /* ignore */ }
    try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload)); } catch (e) { /* quota */ }
  }

  async function loadFromLocal() {
    let data = null;
    try { data = await idbRequest('readonly', s => s.get(RECORD_KEY)); } catch (e) { /* ignore */ }
    if (!data) {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) data = JSON.parse(raw);
      } catch (e) { /* ignore */ }
    }
    return data;
  }

  async function clearLocal() {
    try { await idbRequest('readwrite', s => s.delete(RECORD_KEY)); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------- server mode
  /** Returns server info when the page is served by server.py, otherwise null (e.g. Vercel). */
  function getServerInfo() {
    if (!serverInfoPromise) {
      serverInfoPromise = fetchJson('/api/server-info').then(info => (info && info.serverMode) ? info : null);
    }
    return serverInfoPromise;
  }

  async function isServerMode() {
    return !!(await getServerInfo());
  }

  const PASSCODE_STORAGE_KEY = 'pea_dashboard_upload_passcode';
  function getStoredPasscode() {
    return localStorage.getItem(PASSCODE_STORAGE_KEY) || sessionStorage.getItem(PASSCODE_STORAGE_KEY) || '';
  }
  function setStoredPasscode(code) {
    if (code) {
      localStorage.setItem(PASSCODE_STORAGE_KEY, code);
    } else {
      localStorage.removeItem(PASSCODE_STORAGE_KEY);
      sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
    }
  }

  async function postJson(url, body, contentType) {
    const headers = { 'Content-Type': contentType || 'application/json' };
    const passcode = getStoredPasscode();
    if (passcode) {
      headers['X-Upload-Passcode'] = passcode;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: body === undefined ? '{}' : body
    });
    let json = {};
    try { json = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
    return json;
  }

  // ------------------------------------------------------------ public API
  /**
   * Save an uploaded dataset.
   * On the local server: stored centrally (+ history). On Vercel/static: stored only in this browser.
   * @returns {Promise<{success:boolean, serverSaved:boolean, id?:string, savedAt:number}>}
   */
  async function saveLatestData(data, rawFile, uploadedBy, passcode) {
    if (!data) return { success: false, serverSaved: false };

    const effectivePasscode = passcode || getStoredPasscode();
    const payload = {
      ...data,
      isCustomUpload: true,
      savedAt: Date.now(),
      uploadedBy: uploadedBy || '',
      passcode: effectivePasscode
    };
    delete payload._storageSource;

    if (await isServerMode()) {
      try {
        const res = await postJson('/api/save-data', JSON.stringify(payload));
        payload.savedAt = res.savedAt;
        payload.uploadId = res.id;
        delete payload.passcode;
        if (rawFile) {
          try {
            await postJson(`/api/upload-excel?id=${encodeURIComponent(res.id)}`, rawFile, 'application/octet-stream');
          } catch (e) {
            console.warn('Archiving Excel failed:', e);
          }
        }
        await saveToLocal(payload);
        return { success: true, serverSaved: true, id: res.id, savedAt: res.savedAt };
      } catch (e) {
        console.warn('Central save failed, keeping local copy only:', e);
        throw e; // rethrow so caller can display server authentication error
      }
    }

    delete payload.passcode;
    payload._localOnly = true;
    await saveToLocal(payload);
    return { success: true, serverSaved: false, savedAt: payload.savedAt };
  }

  /**
   * Load the dataset to display.
   * Central data (data/latest_data.json) wins, unless this browser has a newer personal upload.
   */
  async function loadLatestData() {
    const central = await fetchJson('data/latest_data.json');
    const local = await loadFromLocal();

    if (isDataset(central)) {
      if (local && local._localOnly && (local.savedAt || 0) > (central.savedAt || 0)) {
        local._storageSource = 'local';
        return local;
      }
      central._storageSource = 'server';
      central.isCustomUpload = true;
      saveToLocal(central).catch(() => {});
      return central;
    }

    // No central data: only show personal uploads (not stale copies of old central data)
    if (local && (local._localOnly || !isHttp)) {
      local._storageSource = 'local';
      return local;
    }
    return null;
  }

  /** Current central dataset metadata (used to detect new uploads from other machines) */
  function getStatus() {
    return fetchJson('data/metadata.json');
  }

  /** @returns {Promise<Object|null>} metadata if central data is newer than currentSavedAt */
  async function checkServerStatus(currentSavedAt) {
    const meta = await getStatus();
    if (meta && meta.savedAt && (!currentSavedAt || meta.savedAt > currentSavedAt + 1000)) {
      return { ...meta, hasCustomData: true };
    }
    return null;
  }

  async function getHistory() {
    const list = await fetchJson('data/upload_history.json');
    return Array.isArray(list) ? list : [];
  }

  async function loadHistorySnapshot(id) {
    const snap = await fetchJson(`data/history/${encodeURIComponent(id)}.json`);
    return isDataset(snap) ? snap : null;
  }

  function historyExcelUrl(id) {
    return `data/history/${encodeURIComponent(id)}.xlsx`;
  }

  function latestExcelUrl() {
    return 'data/latest_uploaded.xlsx';
  }

  async function restoreHistory(id) {
    return postJson(`/api/restore?id=${encodeURIComponent(id)}`);
  }

  async function publish(passcode) {
    const effectivePasscode = passcode || getStoredPasscode();
    const serverMode = await isServerMode();
    if (serverMode) {
      return postJson('/api/publish');
    }
    // Vercel serverless publish mode
    const latestLocal = await loadFromLocal();
    const body = {
      passcode: effectivePasscode,
      dataset: latestLocal || (window.appState && window.appState.data) || null
    };
    return postJson('/api/publish', JSON.stringify(body));
  }

  async function clearLatestData() {
    await clearLocal();
    if (await isServerMode()) {
      try { await postJson('/api/reset'); } catch (e) { console.warn('Server reset failed:', e); }
    }
    return true;
  }

  function savePreferences(prefs) {
    try {
      const updated = { ...(loadPreferences() || {}), ...prefs };
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) { /* ignore */ }
  }

  function loadPreferences() {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  return {
    saveLatestData,
    loadLatestData,
    clearLatestData,
    clearLocal,
    checkServerStatus,
    getStatus,
    getServerInfo,
    isServerMode,
    getHistory,
    loadHistorySnapshot,
    historyExcelUrl,
    latestExcelUrl,
    restoreHistory,
    publish,
    savePreferences,
    loadPreferences,
    getStoredPasscode,
    setStoredPasscode
  };
})();
