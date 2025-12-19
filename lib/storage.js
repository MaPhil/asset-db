import fs from 'fs';
import path from 'path';

import { logger } from './logger.js';

export const STORAGE_DIR = path.join(process.cwd(), 'storage');
export const RAW_ASSETS_DIR = path.join(STORAGE_DIR, 'raw-assets');
export const ARCHIVED_RAW_ASSETS_DIR = path.join(STORAGE_DIR, 'archived-raw-assets');
export const ARCHIVED_MEASURES_DIR = path.join(STORAGE_DIR, 'archived-measures');
const ensureJsonFile = (filePath, initialData) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
  }
};
export const ASSET_POOL_FILE = path.join(STORAGE_DIR, 'asset-pool.json');
export const ASSET_SUB_CATEGORIES_FILE = path.join(STORAGE_DIR, 'asset_sub_categories.json');
export const MEASURES_FILE = path.join(STORAGE_DIR, 'measures.json');
export const REPORTS_ABDECKUNG_FILE = path.join(STORAGE_DIR, 'reports_abdeckung.json');

function ensureStorageLayout() {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.mkdirSync(RAW_ASSETS_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVED_RAW_ASSETS_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVED_MEASURES_DIR, { recursive: true });

  ensureJsonFile(ASSET_POOL_FILE, {
    meta: { mapping: {}, headers: [] },
    data: {}
  });
  ensureJsonFile(ASSET_SUB_CATEGORIES_FILE, { data: {} });
  ensureJsonFile(MEASURES_FILE, { data: {} });
  ensureJsonFile(REPORTS_ABDECKUNG_FILE, {
    generatedAt: null,
    totalAssets: 0,
    unmatchedCount: 0,
    groups: []
  });
}

ensureStorageLayout();

function ensureLegacyFile(table) {
  const filePath = path.join(STORAGE_DIR, `${table}.json`);
  if (!fs.existsSync(filePath)) {
    const initial =
      table === 'groups'
        ? {
            meta: { seq: 0, updatedAt: new Date().toISOString() },
            data: {}
          }
        : {
            meta: { seq: 0, updatedAt: new Date().toISOString() },
            rows: []
          };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2));
    logger.info('Legacy storage table initialized', { table });
  }
  return filePath;
}

const normalizeGroupRow = (row) => {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
  if (!slug) {
    return null;
  }
  const { id, ...rest } = row;
  return { ...rest, slug };
};

export function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (fallback !== null && !fs.existsSync(filePath)) {
      return fallback;
    }
    logger.error('Could not read JSON file', error, { filePath });
    throw error;
  }
}

export function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    logger.error('Could not write JSON file', error, { filePath });
    throw error;
  }
}

function readFile(table) {
  const filePath = ensureLegacyFile(table);
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (table === 'groups') {
      const data = payload?.data ?? {};
      const legacyRows = Array.isArray(payload?.rows) ? payload.rows : [];
      const combined = {};
      Object.values(data).forEach((row) => {
        const normalized = normalizeGroupRow(row);
        if (normalized) {
          combined[normalized.slug] = normalized;
        }
      });
      legacyRows.forEach((row) => {
        const normalized = normalizeGroupRow(row);
        if (normalized) {
          combined[normalized.slug] = normalized;
        }
      });
      const rows = Object.values(combined);
      if (
        !payload?.data ||
        (Array.isArray(payload?.rows) && payload.rows.length > 0)
      ) {
        writeFile('groups', { meta: payload?.meta ?? {}, rows });
      }
      return {
        meta: payload?.meta ?? {},
        rows
      };
    }
    return payload;
  } catch (error) {
    logger.error('Speichertabelle konnte nicht gelesen werden', error, { table, filePath });
    throw error;
  }
}

function writeFile(table, data) {
  const filePath = ensureLegacyFile(table);
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const payloadMeta = {
    seq: data.meta?.seq ?? 0,
    updatedAt: new Date().toISOString()
  };
  let payload;
  if (table === 'groups') {
    const groupedData = {};
    rows.forEach((row) => {
      const normalized = normalizeGroupRow(row);
      if (!normalized) {
        return;
      }
      groupedData[normalized.slug] = normalized;
    });
    payload = {
      meta: payloadMeta,
      data: groupedData
    };
  } else {
    payload = {
      meta: payloadMeta,
      rows
    };
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return payload;
  } catch (error) {
    logger.error('Speichertabelle konnte nicht geschrieben werden', error, { table, filePath });
    throw error;
  }
}

function nextId(data) {
  const meta = data.meta ?? {};
  const next = (meta.seq ?? 0) + 1;
  data.meta = { ...meta, seq: next };
  return next;
}

export const store = {
  get(table) {
    logger.debug('Lese aus Speichertabelle', { table });
    return readFile(table);
  },
  set(table, data) {
    logger.debug('Schreibe in Speichertabelle', { table });
    return writeFile(table, data);
  },
  insert(table, row) {
    logger.debug('Füge Zeile in Speichertabelle ein', { table });
    const data = readFile(table);
    if (table === 'groups') {
      const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
      if (!slug) {
        logger.warn('Gruppe ohne Slug kann nicht gespeichert werden', { row });
        throw new Error('Ungültiger Gruppenbezeichner.');
      }
      if (data.rows.find((entry) => entry.slug === slug)) {
        logger.warn('Gruppe mit Slug existiert bereits', { slug });
        throw new Error('Gruppe mit diesem Slug existiert bereits.');
      }
      nextId(data);
      const entry = normalizeGroupRow({ ...row, slug });
      if (!entry) {
        logger.warn('Gruppe konnte nicht normalisiert werden', { row });
        throw new Error('Ungültige Gruppendaten.');
      }
      data.rows.push(entry);
      writeFile(table, data);
      return slug;
    }
    const id = nextId(data);
    data.rows.push({ id, ...row });
    writeFile(table, data);
    return id;
  },
  update(table, id, patch) {
    logger.debug('Aktualisiere Zeile in Speichertabelle', { table, id });
    const data = readFile(table);
    if (table === 'groups') {
      const slug = typeof id === 'string' ? id.trim() : '';
      if (!slug) {
        logger.warn('Ungültiger Gruppenbezeichner für Update', { table, id });
        return false;
      }
      const index = data.rows.findIndex((entry) => entry.slug === slug);
      if (index === -1) {
        logger.warn('Gruppe für Update nicht gefunden', { slug });
        return false;
      }
      const safePatch = { ...patch };
      delete safePatch.slug;
      data.rows[index] = { ...data.rows[index], ...safePatch };
      writeFile(table, data);
      return true;
    }
    const index = data.rows.findIndex((entry) => entry.id === id);
    if (index === -1) {
      logger.warn('Zeile für Aktualisierung nicht gefunden', { table, id });
      return false;
    }
    data.rows[index] = { ...data.rows[index], ...patch };
    writeFile(table, data);
    return true;
  },
  remove(table, id) {
    logger.debug('Entferne Zeile aus Speichertabelle', { table, id });
    const data = readFile(table);
    const originalLength = data.rows.length;
    if (table === 'groups') {
      const slug = typeof id === 'string' ? id.trim() : '';
      data.rows = data.rows.filter((entry) => entry.slug !== slug);
      if (data.rows.length !== originalLength) {
        writeFile(table, data);
      } else {
        logger.debug('Keine Zeile aus Speichertabelle entfernt', { table, id });
      }
      return;
    }
    data.rows = data.rows.filter((entry) => entry.id !== id);
    if (data.rows.length !== originalLength) {
      writeFile(table, data);
    } else {
      logger.debug('Keine Zeile aus Speichertabelle entfernt', { table, id });
    }
  },
  upsertSchemaCol(colName) {
    logger.debug('Schema-Spalte wird eingepflegt', { colName });
    const data = readFile('schema');
    const exists = data.rows.some((row) => row.col_name === colName);
    if (!exists) {
      const id = nextId(data);
      data.rows.push({ id, col_name: colName });
      writeFile('schema', data);
    } else {
      logger.debug('Schema-Spalte ist bereits vorhanden', { colName });
    }
  }
};

export function ensureDirectoryExists(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}
