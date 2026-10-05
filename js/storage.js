/**
 * storage.js
 * PEA Construction & Disbursement Dashboard
 * Hybrid persistence engine:
 * 1. Central Server Storage (Source of Truth across all machines & browsers)
 * 2. IndexedDB & localStorage (Fast local responsiveness & offline fallback)
 */

window.DashboardStorage = (function () {
  'use strict';

  const DB_NAME = 'PEA_Dashboard_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'dashboard_state';
  const RECORD_KEY = 'latest_uploaded_data';
  const LOCAL_STORAGE_KEY = 'pea_dashboard_latest_data';
  const PREFS_STORAGE_KEY = 'pea_dashboard_preferences';

  let dbPromise = null;

  /**
   * Initialize or get IndexedDB connection
   */
  function getDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported in this browser, using fallback');
        resolve(null);
        return;
      }

      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function (event) {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };

        request.onsuccess = function (event) {
          resolve(event.target.result);
        };

        request.onerror = function (event) {
          console.error('IndexedDB open error:', event.target.error);
          resolve(null);
        };
      } catch (err) {
        console.error('IndexedDB exception:', err);
        resolve(null);
      }
    });

    return dbPromise;
  }

  /**
   * Save payload to local browser cache (IndexedDB + localStorage)
   */
  async function saveToLocal(payload) {
    if (!payload) return;

    try {
      const db = await getDB();
      if (db) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.put(payload, RECORD_KEY);

          request.onsuccess = () => resolve();
          request.onerror = (e) => reject(e.target.error);
        });
      }
    } catch (idbErr) {
      console.warn('Local IndexedDB write warning:', idbErr);
    }

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch (lsErr) {
      console.warn('LocalStorage write warning (quota exceeded?):', lsErr);
    }
  }

  /**
   * Load dataset from local browser cache
   */
  async function loadFromLocal() {
    let loadedData = null;

    try {
      const db = await getDB();
      if (db) {
        loadedData = await new Promise((resolve, reject) => {
          const tx = db.transaction([STORE_NAME], 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(RECORD_KEY);

          request.onsuccess = (e) => resolve(e.target.result || null);
          request.onerror = (e) => reject(e.target.error);
        });
      }
    } catch (idbErr) {
      console.warn('Local IndexedDB read failed:', idbErr);
    }

    if (!loadedData) {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
          loadedData = JSON.parse(raw);
        }
      } catch (lsErr) {
        console.warn('LocalStorage read failed:', lsErr);
      }
    }

    return loadedData;
  }

  /**
   * Clear local browser cache
   */
  async function clearLocal() {
    try {
      const db = await getDB();
      if (db) {
        await new Promise((resolve, reject) => {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.delete(RECORD_KEY);

          request.onsuccess = () => resolve();
          request.onerror = (e) => reject(e.target.error);
        });
      }
    } catch (idbErr) {
      console.warn('Local IndexedDB clear failed:', idbErr);
    }

    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (lsErr) {
      console.warn('LocalStorage remove failed:', lsErr);
    }
  }

  /**
   * Save uploaded dataset into persistent storage (Server + Local)
   * @param {Object} data - Parsed dashboard data
   * @param {File|Blob} [rawFile] - Optional raw Excel file to archive on server
   * @returns {Promise<{success: boolean, serverSaved: boolean}>}
   */
  async function saveLatestData(data, rawFile) {
    if (!data) return { success: false, serverSaved: false };

    const payload = {
      ...data,
      isCustomUpload: true,
      savedAt: Date.now()
    };

    // 1. Immediately cache to local browser storage
    await saveToLocal(payload);

    let serverSaved = false;

    // 2. Synchronize to Central Server if running under HTTP/HTTPS
    if (window.location.protocol.startsWith('http')) {
      try {
        const res = await fetch('/api/save-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          serverSaved = true;
          console.info('Successfully saved dashboard dataset to central server storage.');
        } else {
          console.warn('Server storage responded with status:', res.status);
        }
      } catch (netErr) {
        console.warn('Could not connect to server storage API (running static/offline):', netErr);
      }

      // If raw Excel file is available, archive it to the server
      if (rawFile && serverSaved) {
        try {
          await fetch('/api/upload-excel', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream'
            },
            body: rawFile
          });
          console.info('Successfully archived original Excel file to server.');
        } catch (excelErr) {
          console.warn('Failed to archive Excel file to server:', excelErr);
        }
      }
    }

    return {
      success: true,
      serverSaved: serverSaved
    };
  }

  /**
   * Load the latest uploaded dataset
   * Priority:
   * 1. Central Server (Always freshest across all computers)
   * 2. Static data file fallback (/data/latest_data.json)
   * 3. Local browser cache (IndexedDB / localStorage)
   * @returns {Promise<Object|null>}
   */
  async function loadLatestData() {
    let loadedData = null;
    let source = null;

    // 1. Check Central Server API (if HTTP/HTTPS)
    if (window.location.protocol.startsWith('http')) {
      try {
        const res = await fetch(`/api/data?_t=${Date.now()}`, {
          headers: { 'Cache-Control': 'no-cache' }
        });

        if (res.ok) {
          const json = await res.json();
          // Verify valid dataset structure
          if (json && (json.transmissionLines || json.substationsDetail) && json.hasData !== false) {
            loadedData = json;
            source = 'server';
            // Sync down to local storage for offline resiliency
            saveToLocal(json).catch(() => {});
          }
        }
      } catch (apiErr) {
        console.info('Server API not reachable, checking static data file:', apiErr.message);
      }

      // 1.1 Fallback check for static hosting data file (data/latest_data.json)
      if (!loadedData) {
        try {
          const staticRes = await fetch(`data/latest_data.json?_t=${Date.now()}`);
          if (staticRes.ok) {
            const staticJson = await staticRes.json();
            if (staticJson && (staticJson.transmissionLines || staticJson.substationsDetail)) {
              loadedData = staticJson;
              source = 'server';
              saveToLocal(staticJson).catch(() => {});
            }
          }
        } catch (staticErr) {
          // Normal if not deployed or no previous upload
        }
      }
    }

    // 2. Fallback to Local Browser Storage (IndexedDB / LocalStorage)
    if (!loadedData) {
      loadedData = await loadFromLocal();
      if (loadedData) {
        source = 'local';
      }
    }

    if (loadedData) {
      loadedData._storageSource = source;
    }

    return loadedData;
  }

  /**
   * Clear the saved uploaded dataset from both server and local storage
   * @returns {Promise<boolean>}
   */
  async function clearLatestData() {
    // 1. Clear local browser cache
    await clearLocal();

    // 2. Request server reset if running under HTTP/HTTPS
    if (window.location.protocol.startsWith('http')) {
      try {
        await fetch('/api/reset', { method: 'POST' });
        console.info('Reset central server storage to default.');
      } catch (err) {
        console.warn('Failed to reset server storage:', err);
      }
    }

    return true;
  }

  /**
   * Check if server has newer data than current client
   * @param {number} currentSavedAt - Timestamp of current dataset
   * @returns {Promise<Object|null>}
   */
  async function checkServerStatus(currentSavedAt) {
    if (!window.location.protocol.startsWith('http')) return null;

    try {
      const res = await fetch(`/api/status?_t=${Date.now()}`);
      if (res.ok) {
        const status = await res.json();
        if (status.hasCustomData && status.savedAt) {
          // If server is newer by > 2.5 seconds
          if (!currentSavedAt || status.savedAt > (currentSavedAt + 2500)) {
            return status;
          }
        }
      }
    } catch (e) {
      // Server down or offline
    }
    return null;
  }

  /**
   * Get server network info (IPs, LAN URLs)
   */
  async function getServerInfo() {
    if (!window.location.protocol.startsWith('http')) return null;

    try {
      const res = await fetch(`/api/server-info?_t=${Date.now()}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // Ignored
    }
    return null;
  }

  /**
   * Save user UI preferences
   */
  function savePreferences(prefs) {
    try {
      const current = loadPreferences() || {};
      const updated = { ...current, ...prefs };
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save preferences:', e);
    }
  }

  /**
   * Load user UI preferences
   */
  function loadPreferences() {
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  return {
    saveLatestData: saveLatestData,
    loadLatestData: loadLatestData,
    clearLatestData: clearLatestData,
    checkServerStatus: checkServerStatus,
    getServerInfo: getServerInfo,
    savePreferences: savePreferences,
    loadPreferences: loadPreferences
  };
})();
