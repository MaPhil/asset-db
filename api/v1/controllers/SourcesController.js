import XLSX from 'xlsx';

import { store } from '../../../lib/storage.js';
import { rebuildUnified } from '../../../lib/merge.js';

export const SourcesController = {
  list: (req, res) => {
    res.json(store.get('sources').rows);
  },

  get: (req, res) => {
    const id = Number(req.params.id);
    const source = store.get('sources').rows.find((row) => row.id === id);
    if (!source) {
      return res.status(404).json({ error: 'Not found' });
    }

    const rows = store
      .get('source_rows')
      .rows.filter((row) => row.source_id === id)
      .sort((a, b) => a.row_index - b.row_index);

    res.json({ source, rows });
  },

  upload: (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const displayName = (req.body.name || file.originalname).trim();
    const id = store.insert('sources', {
      name: displayName,
      original_filename: file.originalname,
      stored_path: file.path,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const workbook = XLSX.readFile(file.path, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const records = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

    let index = 0;
    for (const record of records) {
      store.insert('source_rows', {
        source_id: id,
        row_index: index++,
        data: record
      });
    }

    if (records[0]) {
      Object.keys(records[0]).forEach((column) => store.upsertSchemaCol(column));
    }

    rebuildUnified();

    res.json({ ok: true, source_id: id, rows: records.length });
  },

  remove: (req, res) => {
    const id = Number(req.params.id);
    const sources = store.get('sources');
    const exists = sources.rows.some((row) => row.id === id);
    if (!exists) {
      return res.status(404).json({ error: 'Not found' });
    }

    sources.rows = sources.rows.filter((row) => row.id !== id);
    store.set('sources', sources);

    const rows = store.get('source_rows');
    rows.rows = rows.rows.filter((row) => row.source_id !== id);
    store.set('source_rows', rows);

    const mappings = store.get('mappings');
    mappings.rows = mappings.rows.filter((mapping) => mapping.source_id !== id);
    store.set('mappings', mappings);

    rebuildUnified();

    res.json({ ok: true });
  },

  headers: (req, res) => {
    const id = Number(req.params.id);
    const rows = store
      .get('source_rows')
      .rows.filter((row) => row.source_id === id)
      .sort((a, b) => a.row_index - b.row_index);

    const headers = rows[0] ? Object.keys(rows[0].data || {}) : [];
    res.json({ headers });
  }
};
