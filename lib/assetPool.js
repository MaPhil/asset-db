import { ASSET_POOL_FILE, readJsonFile, writeJsonFile, store } from './storage.js';
import { logger } from './logger.js';
import { getSetting, setSetting } from './settings.js';

const FIELD_SETTINGS_KEY = 'assetPoolFieldSettings';
const INTERNAL_FIELDS = new Set(['archived', 'id', 'uploadId', 'rowIndex', 'systemId', 'system_id', 'systemID']);
const DEFAULT_ASSET_POOL = { meta: { mapping: {}, headers: [] }, data: {} };

const normalizeFieldName = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

function sanitizeHeaders(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set();
  const sanitized = [];
  values.forEach((value) => {
    const header = normalizeFieldName(value);
    if (!header) {
      return;
    }
    if (INTERNAL_FIELDS.has(header)) {
      return;
    }
    if (seen.has(header)) {
      return;
    }
    seen.add(header);
    sanitized.push(header);
  });
  return sanitized;
}

function mergeHeaders(existing, addition) {
  const merged = [...existing];
  const seen = new Set(existing);
  addition.forEach((value) => {
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    merged.push(value);
  });
  return merged;
}

function areHeadersEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function addHeaderToMeta(pool, field) {
  const header = normalizeFieldName(field);
  if (!header || INTERNAL_FIELDS.has(header)) {
    return false;
  }
  const headers = Array.isArray(pool.meta.headers) ? pool.meta.headers : [];
  if (headers.includes(header)) {
    return false;
  }
  pool.meta.headers = [...headers, header];
  return true;
}

function removeHeaderFromMeta(pool, field) {
  const header = normalizeFieldName(field);
  if (!header) {
    return false;
  }
  const headers = Array.isArray(pool.meta.headers) ? pool.meta.headers : [];
  const index = headers.indexOf(header);
  if (index === -1) {
    return false;
  }
  const updated = [...headers];
  updated.splice(index, 1);
  pool.meta.headers = updated;
  return true;
}

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

function getMappedFieldsFromSchema() {
  const schema = store.get('schema');
  if (!Array.isArray(schema?.rows)) {
    return [];
  }
  return schema.rows.map((row) => row.col_name).filter(Boolean);
}

function normalizeAssetPool() {
  const payload = readJsonFile(ASSET_POOL_FILE, DEFAULT_ASSET_POOL);
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const meta = payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta) ? payload.meta : {};
    const mapping = meta.mapping && typeof meta.mapping === 'object' && !Array.isArray(meta.mapping) ? meta.mapping : {};
    const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data : {};
    const storedHeaders = sanitizeHeaders(meta.headers);
    const mappedFields = sanitizeHeaders(getMappedFieldsFromMeta({ meta: { mapping } }));
    const mergedHeaders = mergeHeaders(storedHeaders, mappedFields);
    const normalizedMeta = { ...meta, mapping, headers: mergedHeaders };
    const normalizedPool = { meta: normalizedMeta, data };
    if (!areHeadersEqual(storedHeaders, mergedHeaders)) {
      writePool(normalizedPool);
    }
    return normalizedPool;
  }
  logger.warn('Asset pool payload invalid, resetting.');
  return DEFAULT_ASSET_POOL;
}

function writePool(pool) {
  return writeJsonFile(ASSET_POOL_FILE, pool);
}

function getMappedFieldsFromMeta(pool) {
  const mapping = pool?.meta?.mapping;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    return [];
  }

  const fields = new Set();
  Object.values(mapping).forEach((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return;
    }
    Object.values(entry).forEach((field) => {
      const normalized = normalizeFieldName(field);
      if (!normalized) {
        return;
      }
      if (INTERNAL_FIELDS.has(normalized)) {
        return;
      }
      if (fields.has(normalized)) {
        return;
      }
      fields.add(normalized);
    });
  });

  return Array.from(fields);
}

function getAssetPoolHeaders(pool) {
  const metaHeaders = sanitizeHeaders(pool?.meta?.headers);
  if (metaHeaders.length) {
    return metaHeaders;
  }
  const mappedFields = getMappedFieldsFromMeta(pool);
  if (mappedFields.length) {
    return mappedFields;
  }
  return sanitizeHeaders(getMappedFieldsFromSchema());
}

function buildFieldStats(assets, allowedFields) {
  const allowed = new Set(
    (allowedFields || []).filter((field) => field && !INTERNAL_FIELDS.has(field))
  );
  const counts = new Map();
  allowed.forEach((field) => {
    counts.set(field, 0);
  });
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
  return Object.values(pool.data).reduce((fields, asset) => {
    Object.keys(asset).forEach((field) => {
      if (!INTERNAL_FIELDS.has(field) && !fields.includes(field)) {
        fields.push(field);
      }
    });
    return fields;
  }, []);
}

function listAssetPool({ page = 1, pageSize = 50 } = {}) {
  const pool = normalizeAssetPool();
  const entries = Object.entries(pool.data).map(([id, data]) => ({ id, ...data }));
  const filtered = entries.filter((entry) => entry.archived !== true);
  const total = filtered.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const rows = filtered.slice(start, start + pageSize);
  const columnsFromMeta = getAssetPoolHeaders(pool);
  const allowedSet = columnsFromMeta.length ? new Set(columnsFromMeta) : null;
  const fieldSet = filtered.reduce((set, entry) => {
    Object.keys(entry).forEach((key) => {
      if (INTERNAL_FIELDS.has(key)) {
        return;
      }
      if (allowedSet && !allowedSet.has(key)) {
        return;
      }
      set.add(key);
    });
    return set;
  }, new Set());
  const columns = columnsFromMeta.length ? columnsFromMeta : Array.from(fieldSet);

  return {
    rows,
    total,
    page,
    pageSize,
    fieldStats: buildFieldStats(filtered, columns),
    columns,
    fieldSettings: readFieldSettings(),
    meta: pool.meta
  };
}

export function upsertAssets(assetEntries, { mapping, uploadId } = {}) {
  const pool = normalizeAssetPool();
  const poolData = pool.data;

  if (mapping && uploadId) {
    const existingMapping =
      pool.meta && typeof pool.meta.mapping === 'object' && !Array.isArray(pool.meta.mapping)
        ? pool.meta.mapping
        : {};
    pool.meta = { ...pool.meta, mapping: { ...existingMapping, [uploadId]: mapping } };
    Object.values(mapping).forEach((field) => addHeaderToMeta(pool, field));
  }

  assetEntries.forEach(({ id, data }) => {
    if (!id) return;
    const current = poolData[id] || {};
    poolData[id] = {
      ...current,
      ...data,
      archived: data.archived ?? current.archived ?? false
    };
  });
  writePool({ ...pool, data: poolData });
  return poolData;
}

export function updateAsset(assetId, patch) {
  const pool = normalizeAssetPool();
  if (!pool.data[assetId]) {
    return null;
  }
  pool.data[assetId] = { ...pool.data[assetId], ...patch };
  writePool(pool);
  return pool.data[assetId];
}

export function updateAssets(assetIds, patch) {
  const pool = normalizeAssetPool();
  assetIds.forEach((id) => {
    if (pool.data[id]) {
      pool.data[id] = { ...pool.data[id], ...patch };
    }
  });
  writePool(pool);
  return pool;
}

export function ensureFieldOnAssets(field) {
  const pool = normalizeAssetPool();
  const normalized = normalizeFieldName(field);
  if (!normalized) {
    return pool;
  }
  addHeaderToMeta(pool, normalized);
  Object.keys(pool.data).forEach((id) => {
    if (!(normalized in pool.data[id])) {
      pool.data[id][normalized] = '';
    }
  });
  writePool(pool);
  return pool;
}

export function removeFieldFromAssets(field) {
  const pool = normalizeAssetPool();
  const normalized = normalizeFieldName(field);
  if (!normalized) {
    return pool;
  }
  Object.keys(pool.data).forEach((id) => {
    if (normalized in pool.data[id]) {
      delete pool.data[id][normalized];
    }
  });
  removeHeaderFromMeta(pool, normalized);
  writePool(pool);
  removeFieldSettings(normalized);
  return pool;
}

export function getAssetPoolView(options = {}) {
  return listAssetPool(options);
}

export function updateFieldEditable(field, editable) {
  return setFieldEditable(field, editable);
}
