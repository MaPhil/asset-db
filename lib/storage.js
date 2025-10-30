import fs from 'fs';
import path from 'path';

import { logger } from './logger.js';

const STORAGE_DIR = path.join(process.cwd(), 'storage');
const TABLES = [
  'sources',
  'source_rows',
  'mappings',
  'schema',
  'unified_assets',
  'categories',
  'groups',
  'group_categories',
  'group_asset_types',
  'raw_tables',
  'raw_rows',
  'raw_mappings',
  'asset_pool_fields',
  'asset_pool_cells',
  'settings',
  'asset_type_decisions',
  'measure_versions',
  'measure_state',
  'measure_topics',
  'measure_sub_topics',
  'measure_categories',
  'measures'
];

function ensureTableFiles() {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    for (const table of TABLES) {
      const filePath = path.join(STORAGE_DIR, `${table}.json`);
      if (!fs.existsSync(filePath)) {
        const initial = {
          meta: { seq: 0, updatedAt: new Date().toISOString() },
          rows: []
        };
        fs.writeFileSync(filePath, JSON.stringify(initial, null, 2));
        logger.info('Speichertabelle initialisiert', { table });
      }
    }
  } catch (error) {
    logger.error('Speichertabellen konnten nicht initialisiert werden', error);
    throw error;
  }
}

ensureTableFiles();

function readFile(table) {
  const filePath = path.join(STORAGE_DIR, `${table}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    logger.error('Speichertabelle konnte nicht gelesen werden', error, { table, filePath });
    throw error;
  }
}

function writeFile(table, data) {
  const filePath = path.join(STORAGE_DIR, `${table}.json`);
  const payload = {
    meta: {
      seq: data.meta?.seq ?? 0,
      updatedAt: new Date().toISOString()
    },
    rows: Array.isArray(data.rows) ? data.rows : []
  };
  const tempPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
    fs.renameSync(tempPath, filePath);
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
