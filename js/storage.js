/**
 * storage.js
 * PEA Construction & Disbursement Dashboard
 * Client-side persistence engine using IndexedDB with localStorage fallback
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

    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported, will use localStorage fallback');
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
          resolve(null); // Fallback to localStorage
        };
      } catch (err) {
        console.error('IndexedDB exception:', err);
        resolve(null);
      }
    });

    return dbPromise;
  }

  /**
   * Save uploaded dataset into persistent storage
   * @param {Object} data - Parsed dashboard data
   * @returns {Promise<boolean>}
   */
  async function saveLatestData(data) {
    if (!data) return false;

    const payload = {
      ...data,
      isCustomUpload: true,
      savedAt: Date.now()
    };

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
      console.warn('IndexedDB write failed, trying localStorage:', idbErr);
    }

    // Always attempt localStorage backup as well (with safety catch for quota)
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch (lsErr) {
      console.warn('localStorage write failed (quota exceeded?):', lsErr);
    }

    return true;
  }

  /**
   * Load the latest uploaded dataset from persistent storage
   * @returns {Promise<Object|null>}
   */
  async function loadLatestData() {
    let loadedData = null;

    // 1. Try IndexedDB first
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
      console.warn('IndexedDB read failed, trying localStorage:', idbErr);
    }

    // 2. Fallback to localStorage if not found in IndexedDB
    if (!loadedData) {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
          loadedData = JSON.parse(raw);
        }
      } catch (lsErr) {
        console.warn('localStorage read error:', lsErr);
      }
    }

    return loadedData;
  }

  /**
   * Clear the saved uploaded dataset (e.g. when resetting to default)
   * @returns {Promise<boolean>}
   */
  async function clearLatestData() {
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
      console.warn('IndexedDB delete error:', idbErr);
    }

    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (lsErr) {
      console.warn('localStorage remove error:', lsErr);
    }

    return true;
  }

  /**
   * Save user UI preferences (activeTab, filters)
   * @param {Object} prefs 
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
   * @returns {Object|null}
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
    savePreferences: savePreferences,
    loadPreferences: loadPreferences
  };
})();
