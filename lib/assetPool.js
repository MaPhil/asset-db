import { ASSET_POOL_FILE, readJsonFile, writeJsonFile, store } from './storage.js';
import { logger } from './logger.js';
import { getSetting, setSetting } from './settings.js';

const FIELD_SETTINGS_KEY = 'assetPoolFieldSettings';
const INTERNAL_FIELDS = new Set(['archived', 'id', 'uploadId', 'rowIndex', 'systemId', 'system_id', 'systemID']);

function readFieldSettings() {
  const settings = getSetting(FIELD_SETTINGS_KEY);
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    return settings;
  }
  return {};
}

function writeFieldSettings(settings) {
  setSetting(FIELD_SETTINGS_KEY, settings);
  return settings;
}

function setFieldEditable(field, editable) {
  if (!field) {
    return readFieldSettings();
  }
  const settings = readFieldSettings();
  settings[field] = { ...(settings[field] || {}), editable: Boolean(editable) };
  return writeFieldSettings(settings);
}

function removeFieldSettings(field) {
  if (!field) return;
  const settings = readFieldSettings();
  if (settings[field]) {
    delete settings[field];
    writeFieldSettings(settings);
  }
}

function getMappedFields() {
  const schema = store.get('schema');
  if (!Array.isArray(schema?.rows)) {
    return [];
  }
  return schema.rows.map((row) => row.col_name).filter(Boolean);
}

function normalizeAssetPool() {
  const payload = readJsonFile(ASSET_POOL_FILE, {});
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload;
  }
  logger.warn('Asset pool payload invalid, resetting.');
  return {};
}

function writePool(pool) {
  return writeJsonFile(ASSET_POOL_FILE, pool);
}

function buildFieldStats(assets, allowedFields) {
  const allowed = new Set(allowedFields.filter((field) => !INTERNAL_FIELDS.has(field)));
  const counts = new Map();
  assets.forEach((asset) => {
    Object.keys(asset).forEach((field) => {
      if (INTERNAL_FIELDS.has(field)) return;
      if (allowed.has(field)) {
        counts.set(field, (counts.get(field) || 0) + 1);
      }
    });
  });
  return Array.from(counts.entries()).map(([field, count]) => ({ field, count }));
}

export function getAssetFieldSuggestions() {
  const pool = normalizeAssetPool();
  return Object.values(pool).reduce((fields, asset) => {
    Object.keys(asset).forEach((field) => {
      if (!INTERNAL_FIELDS.has(field) && !fields.includes(field)) {
        fields.push(field);
      }
    });
    return fields;
  }, []);
}

export function readAssetPool() {
  return normalizeAssetPool();
}

export function writeAssetPool(data) {
  return writePool(data);
}

export function listAssetPool({ page = 1, pageSize = 50 } = {}) {
  const pool = normalizeAssetPool();
  const entries = Object.entries(pool).map(([id, data]) => ({ id, ...data }));
  const filtered = entries.filter((entry) => entry.archived !== true);
  const allowedFields = getMappedFields();
  const allowedSet = new Set(allowedFields);
  const total = filtered.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const rows = filtered.slice(start, start + pageSize);
  const fieldSet = filtered.reduce((set, entry) => {
    Object.keys(entry).forEach((key) => {
      if (INTERNAL_FIELDS.has(key)) {
        return;
      }
      if (!allowedSet.has(key)) {
        return;
      }
      if (key !== 'archived' && key !== 'id' && key !== 'uploadId' && key !== 'rowIndex') {
        set.add(key);
      }
    });
    return set;
  }, new Set());
  const columns = Array.from(fieldSet);

  return {
    rows,
    total,
    page,
    pageSize,
    fieldStats: buildFieldStats(filtered, columns),
    columns,
    fieldSettings: readFieldSettings()
  };
}

export function upsertAssets(assetEntries) {
  const pool = normalizeAssetPool();
  assetEntries.forEach(({ id, data }) => {
    if (!id) return;
    const current = pool[id] || {};
    pool[id] = {
      ...current,
      ...data,
      archived: data.archived ?? current.archived ?? false
    };
  });
  writePool(pool);
  return pool;
}

export function updateAsset(assetId, patch) {
  const pool = normalizeAssetPool();
  if (!pool[assetId]) {
    return null;
  }
  pool[assetId] = { ...pool[assetId], ...patch };
  writePool(pool);
  return pool[assetId];
}

export function updateAssets(assetIds, patch) {
  const pool = normalizeAssetPool();
  assetIds.forEach((id) => {
    if (pool[id]) {
      pool[id] = { ...pool[id], ...patch };
    }
  });
  writePool(pool);
  return pool;
}

export function ensureFieldOnAssets(field) {
  const pool = normalizeAssetPool();
  Object.keys(pool).forEach((id) => {
    if (!(field in pool[id])) {
      pool[id][field] = '';
    }
  });
  writePool(pool);
  return pool;
}

export function removeFieldFromAssets(field) {
  const pool = normalizeAssetPool();
  Object.keys(pool).forEach((id) => {
    if (field in pool[id]) {
      delete pool[id][field];
    }
  });
  writePool(pool);
  removeFieldSettings(field);
  return pool;
}

export function getAssetPoolView(options = {}) {
  return listAssetPool(options);
}

export function updateFieldEditable(field, editable) {
  return setFieldEditable(field, editable);
}

export function getFieldSettings() {
  return readFieldSettings();
}
