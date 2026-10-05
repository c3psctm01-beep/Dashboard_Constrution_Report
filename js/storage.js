/**
 * storage.js
 * PEA Construction & Disbursement Dashboard
 * Cloud Realtime Persistence Engine powered by Supabase & Local Cache
 *
 * 1. Primary: Supabase Cloud Database (Instant real-time sync for everyone)
 * 2. Secondary: LAN Server persistence (server.py)
 * 3. Fallback: IndexedDB / localStorage (offline cache)
 */

window.DashboardStorage = (function () {
  'use strict';

  const DB_NAME = 'PEA_Dashboard_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'dashboard_state';
  const RECORD_KEY = 'latest_uploaded_data';
  const LOCAL_STORAGE_KEY = 'pea_dashboard_latest_data';
  const PREFS_STORAGE_KEY = 'pea_dashboard_preferences';
  const PASSCODE_STORAGE_KEY = 'pea_dashboard_upload_passcode';

  const isHttp = window.location.protocol.startsWith('http');
  let dbPromise = null;
  let serverInfoPromise = null;
  let supabaseClient = null;
  let realtimeChannel = null;

  // ------------------------------------------------------------- Supabase Client
  function getSupabase() {
    if (supabaseClient) return supabaseClient;
    if (window.supabase && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey) {
      try {
        supabaseClient = window.supabase.createClient(
          window.SUPABASE_CONFIG.url,
          window.SUPABASE_CONFIG.anonKey,
          {
            auth: { persistSession: false }
          }
        );
      } catch (err) {
        console.warn('Supabase initialization failed:', err);
      }
    }
    return supabaseClient;
  }

  function getTableName() {
    return (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.tableName) || 'dashboard_data';
  }

  function getHistoryTableName() {
    return (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.historyTable) || 'dashboard_history';
  }

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
      if (!type.includes('json')) return null;
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
  function getServerInfo() {
    if (!serverInfoPromise) {
      serverInfoPromise = fetchJson('/api/server-info').then(info => (info && info.serverMode) ? info : null);
    }
    return serverInfoPromise;
  }

  async function isServerMode() {
    return !!(await getServerInfo());
  }

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

  async function postJson(url, body, contentType, extraHeaders) {
    const headers = { 'Content-Type': contentType || 'application/json', ...(extraHeaders || {}) };
    const passcode = getStoredPasscode();
    if (passcode && !headers['X-Upload-Passcode']) {
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
   * Save an uploaded dataset directly to Supabase Cloud, LAN server, and local cache.
   */
  async function saveLatestData(data, rawFile, uploadedBy, passcode) {
    if (!data) return { success: false, serverSaved: false };

    const effectivePasscode = passcode || getStoredPasscode();
    if (effectivePasscode !== '1212312121') {
      throw new Error('รหัสผ่านไม่ถูกต้อง (Passcode Invalid) กรุณาใส่ 1212312121');
    }

    const nowMs = Date.now();
    const nowText = new Date().toLocaleDateString('th-TH', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const uploadId = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);

    const payload = {
      ...data,
      isCustomUpload: true,
      savedAt: nowMs,
      uploadId: uploadId,
      uploadedBy: uploadedBy || 'กบส.'
    };
    delete payload._storageSource;
    delete payload.passcode;

    let supabaseSaved = false;
    let serverSaved = false;

    // 1. Direct Save to Supabase Cloud
    const sb = getSupabase();
    if (sb) {
      try {
        const { error: upsertErr } = await sb
          .from(getTableName())
          .upsert({
            id: 'latest',
            file_name: payload.fileName || 'สถานะงานก่อสร้าง.xlsx',
            last_updated: payload.lastUpdated || nowText,
            saved_at: nowMs,
            saved_at_text: nowText,
            uploaded_by: payload.uploadedBy,
            data: payload
          });

        if (upsertErr) {
          console.warn('Supabase upsert error:', upsertErr);
        } else {
          supabaseSaved = true;
        }

        // Insert into history table
        const stats = {
          transmissionLines: (payload.transmissionLines || []).length,
          substations: (payload.substationsDetail || []).length,
          permits: (payload.permits || []).length
        };
        await sb
          .from(getHistoryTableName())
          .insert({
            id: uploadId,
            file_name: payload.fileName || 'สถานะงานก่อสร้าง.xlsx',
            last_updated: payload.lastUpdated || nowText,
            saved_at: nowMs,
            saved_at_text: nowText,
            uploaded_by: payload.uploadedBy,
            stats: stats
          });
      } catch (sbErr) {
        console.warn('Supabase save error:', sbErr);
      }
    }

    // 2. Also sync to local server if running
    if (await isServerMode()) {
      try {
        const res = await postJson('/api/save-data', JSON.stringify({ ...payload, passcode: effectivePasscode }));
        if (rawFile && res.id) {
          try {
            await postJson(`/api/upload-excel?id=${encodeURIComponent(res.id)}`, rawFile, 'application/octet-stream');
          } catch (e) { /* ignore */ }
        }
        serverSaved = true;
      } catch (e) {
        console.warn('LAN server save error:', e);
      }
    }

    // 3. Cache in local storage
    payload._storageSource = supabaseSaved ? 'supabase' : (serverSaved ? 'server' : 'local');
    await saveToLocal(payload);

    return {
      success: true,
      supabaseSaved: supabaseSaved,
      serverSaved: serverSaved,
      id: uploadId,
      savedAt: nowMs
    };
  }

  /**
   * Load the dataset to display.
   * Priority: 1. Supabase Cloud (Live) -> 2. Local Cache (if newer) -> 3. Central Static JSON -> 4. Default
   */
  async function loadLatestData() {
    // 1. Check Supabase Cloud
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: row, error } = await sb
          .from(getTableName())
          .select('*')
          .eq('id', 'latest')
          .maybeSingle();

        if (row && row.data && isDataset(row.data)) {
          const cloudData = row.data;
          cloudData._storageSource = 'supabase';
          cloudData.savedAt = row.saved_at || cloudData.savedAt;
          cloudData.lastUpdated = row.last_updated || cloudData.lastUpdated;
          cloudData.fileName = row.file_name || cloudData.fileName;
          cloudData.isCustomUpload = true;

          // Save to local cache for offline use
          saveToLocal(cloudData).catch(() => {});
          return cloudData;
        }
      } catch (err) {
        console.warn('Supabase load failed, trying fallbacks:', err);
      }
    }

    // 2. Fallback: Central file /data/latest_data.json
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

    if (local && (local._localOnly || !isHttp)) {
      local._storageSource = 'local';
      return local;
    }

    return null;
  }

  /**
   * Get metadata to detect new uploads
   */
  async function checkServerStatus(currentSavedAt) {
    // 1. Supabase status
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: row } = await sb
          .from(getTableName())
          .select('saved_at, file_name, last_updated, uploaded_by')
          .eq('id', 'latest')
          .maybeSingle();

        if (row && row.saved_at && (!currentSavedAt || row.saved_at > currentSavedAt + 500)) {
          return {
            hasCustomData: true,
            savedAt: row.saved_at,
            fileName: row.file_name,
            lastUpdated: row.last_updated,
            uploadedBy: row.uploaded_by,
            source: 'supabase'
          };
        }
      } catch (e) { /* ignore */ }
    }

    // 2. Fallback: metadata.json
    const meta = await fetchJson('data/metadata.json');
    if (meta && meta.savedAt && (!currentSavedAt || meta.savedAt > currentSavedAt + 1000)) {
      return { ...meta, hasCustomData: true, source: 'server' };
    }
    return null;
  }

  /**
   * Get current server / cloud status
   */
  async function getStatus() {
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: row } = await sb
          .from(getTableName())
          .select('saved_at, file_name, last_updated, uploaded_by')
          .eq('id', 'latest')
          .maybeSingle();

        if (row && row.saved_at) {
          return {
            hasCustomData: true,
            id: 'latest',
            savedAt: row.saved_at,
            fileName: row.file_name,
            lastUpdated: row.last_updated,
            uploadedBy: row.uploaded_by,
            source: 'supabase'
          };
        }
      } catch (e) { /* ignore */ }
    }
    const meta = await fetchJson('data/metadata.json');
    if (meta) return meta;
    const local = await loadFromLocal();
    if (local) return { hasCustomData: true, id: local.uploadId || 'latest', ...local };
    return null;
  }

  function isSupabaseConfigured() {
    return !!(window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey);
  }

  /**
   * Get upload history list
   */
  async function getHistory() {
    // 1. Check Supabase
    const sb = getSupabase();
    if (sb) {
      try {
        const { data: rows, error } = await sb
          .from(getHistoryTableName())
          .select('*')
          .order('saved_at', { ascending: false })
          .limit(30);

        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map(r => ({
            id: r.id,
            fileName: r.file_name,
            lastUpdated: r.last_updated,
            savedAt: r.saved_at,
            savedAtText: r.saved_at_text,
            uploadedBy: r.uploaded_by,
            stats: r.stats
          }));
        }
      } catch (e) { /* ignore */ }
    }

    // 2. Fallback to data/upload_history.json
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
    const snap = await loadHistorySnapshot(id);
    if (snap) {
      const sb = getSupabase();
      if (sb) {
        try {
          const nowMs = Date.now();
          const nowText = new Date().toLocaleDateString('th-TH', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
          await sb
            .from(getTableName())
            .upsert({
              id: 'latest',
              file_name: snap.fileName || 'สถานะงานก่อสร้าง.xlsx',
              last_updated: snap.lastUpdated || nowText,
              saved_at: nowMs,
              saved_at_text: nowText,
              uploaded_by: snap.uploadedBy || 'กบส.',
              data: snap
            });
        } catch (e) { /* ignore */ }
      }
    }
    if (await isServerMode()) {
      return postJson(`/api/restore?id=${encodeURIComponent(id)}`);
    }
    return { success: true };
  }

  async function publish() {
    return { success: true, message: 'ข้อมูลซิงค์กับระบบคลาวด์ Supabase เรียบร้อยแล้ว' };
  }

  async function clearLatestData() {
    await clearLocal();
    const sb = getSupabase();
    if (sb) {
      try {
        await sb.from(getTableName()).delete().eq('id', 'latest');
      } catch (e) { /* ignore */ }
    }
    if (await isServerMode()) {
      try { await postJson('/api/reset'); } catch (e) { /* ignore */ }
    }
    return true;
  }

  /**
   * Subscribe to live Realtime updates from Supabase Cloud
   */
  function subscribeRealtime(onUpdateCallback) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      if (realtimeChannel) {
        try { sb.removeChannel(realtimeChannel); } catch (e) { /* ignore */ }
      }

      realtimeChannel = sb
        .channel('dashboard_realtime_channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: getTableName() },
          (payload) => {
            console.log('⚡ [Supabase Realtime] Event:', payload);
            if (payload.new && payload.new.data) {
              if (onUpdateCallback) onUpdateCallback(payload.new);
            }
          }
        )
        .subscribe((status) => {
          console.log('⚡ [Supabase Realtime] Status:', status);
        });

      return realtimeChannel;
    } catch (e) {
      console.warn('Realtime subscription error:', e);
      return null;
    }
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
    getHistory,
    loadHistorySnapshot,
    historyExcelUrl,
    latestExcelUrl,
    restoreHistory,
    publish,
    subscribeRealtime,
    isSupabaseConfigured,
    savePreferences,
    loadPreferences,
    getStoredPasscode,
    setStoredPasscode,
    getSupabase,
    isServerMode,
    getServerInfo
  };
})();
