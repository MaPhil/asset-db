import fs from 'fs';
import path from 'path';

import { logger } from './logger.js';

const STORAGE_DIR = path.join(process.cwd(), 'storage');
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

function ensureStorageLayout() {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.mkdirSync(RAW_ASSETS_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVED_RAW_ASSETS_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVED_MEASURES_DIR, { recursive: true });

  ensureJsonFile(ASSET_POOL_FILE, {
    meta: { mapping: {} },
    data: {}
  });
  ensureJsonFile(ASSET_SUB_CATEGORIES_FILE, { data: {} });
  ensureJsonFile(MEASURES_FILE, { data: {} });
}

ensureStorageLayout();

function ensureLegacyFile(table) {
  const filePath = path.join(STORAGE_DIR, `${table}.json`);
  if (!fs.existsSync(filePath)) {
    const initial = {
      meta: { seq: 0, updatedAt: new Date().toISOString() },
      rows: []
    };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2));
    logger.info('Legacy storage table initialized', { table });
  }
  return filePath;
}

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
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    logger.error('Speichertabelle konnte nicht gelesen werden', error, { table, filePath });
    throw error;
  }
}

function writeFile(table, data) {
  const filePath = ensureLegacyFile(table);
  const payload = {
    meta: {
      seq: data.meta?.seq ?? 0,
      updatedAt: new Date().toISOString()
    },
    rows: Array.isArray(data.rows) ? data.rows : []
  };

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
    const id = nextId(data);
    data.rows.push({ id, ...row });
    writeFile(table, data);
    return id;
  },
  update(table, id, patch) {
    logger.debug('Aktualisiere Zeile in Speichertabelle', { table, id });
    const data = readFile(table);
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
