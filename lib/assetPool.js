import { ASSET_POOL_FILE, readJsonFile, writeJsonFile } from './storage.js';
import { logger } from './logger.js';

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

function buildFieldStats(assets) {
  const counts = new Map();
  assets.forEach((asset) => {
    Object.keys(asset).forEach((field) => {
      if (field === 'archived') return;
      counts.set(field, (counts.get(field) || 0) + 1);
    });
  });
  return Array.from(counts.entries()).map(([field, count]) => ({ field, count }));
}

export function getAssetFieldSuggestions() {
  const pool = normalizeAssetPool();
  return Object.values(pool).reduce((fields, asset) => {
    Object.keys(asset).forEach((field) => {
      if (field !== 'archived' && !fields.includes(field)) {
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

export function listAssetPool({ includeArchived = true, page = 1, pageSize = 50 } = {}) {
  const pool = normalizeAssetPool();
  const entries = Object.entries(pool).map(([id, data]) => ({ id, ...data }));
  const filtered = includeArchived ? entries : entries.filter((entry) => entry.archived !== true);
  const total = filtered.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const rows = filtered.slice(start, start + pageSize);
  const fieldSet = filtered.reduce((set, entry) => {
    Object.keys(entry).forEach((key) => {
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
    fieldStats: buildFieldStats(filtered),
    columns
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
  return pool;
}

export function getAssetPoolView(options = {}) {
  return listAssetPool(options);
}
