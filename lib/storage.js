import fs from 'fs';
import path from 'path';

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
  'raw_tables',
  'raw_rows',
  'raw_mappings'
];

function ensureTableFiles() {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  for (const table of TABLES) {
    const filePath = path.join(STORAGE_DIR, `${table}.json`);
    if (!fs.existsSync(filePath)) {
      const initial = {
        meta: { seq: 0, updatedAt: new Date().toISOString() },
        rows: []
      };
      fs.writeFileSync(filePath, JSON.stringify(initial, null, 2));
    }
  }
}

ensureTableFiles();

function readFile(table) {
  const filePath = path.join(STORAGE_DIR, `${table}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
  return payload;
}

function nextId(data) {
  const meta = data.meta ?? {};
  const next = (meta.seq ?? 0) + 1;
  data.meta = { ...meta, seq: next };
  return next;
}

export const store = {
  get(table) {
    return readFile(table);
  },
  set(table, data) {
    return writeFile(table, data);
  },
  insert(table, row) {
    const data = readFile(table);
    const id = nextId(data);
    data.rows.push({ id, ...row });
    writeFile(table, data);
    return id;
  },
  update(table, id, patch) {
    const data = readFile(table);
    const index = data.rows.findIndex((entry) => entry.id === id);
    if (index === -1) {
      return false;
    }
    data.rows[index] = { ...data.rows[index], ...patch };
    writeFile(table, data);
    return true;
  },
  remove(table, id) {
    const data = readFile(table);
    const originalLength = data.rows.length;
    data.rows = data.rows.filter((entry) => entry.id !== id);
    if (data.rows.length !== originalLength) {
      writeFile(table, data);
    }
  },
  upsertSchemaCol(colName) {
    const data = readFile('schema');
    const exists = data.rows.some((row) => row.col_name === colName);
    if (!exists) {
      const id = nextId(data);
      data.rows.push({ id, col_name: colName });
      writeFile('schema', data);
    }
  }
};
