import fs from 'fs';
import XLSX from 'xlsx';

import { store } from '../../../lib/storage.js';
import { rebuildUnified } from '../../../lib/merge.js';
import { logger } from '../../../lib/logger.js';

export const SourcesController = {
  list: (req, res) => {
    logger.debug('Listing sources');
    res.json(store.get('sources').rows);
  },

  get: (req, res) => {
    const id = Number(req.params.id);
    const source = store.get('sources').rows.find((row) => row.id === id);
    if (!source) {
      logger.warn('Source not found', { sourceId: id });
      return res.status(404).json({ error: 'Not found' });
    }

    const rows = store
      .get('source_rows')
      .rows.filter((row) => row.source_id === id)
      .sort((a, b) => a.row_index - b.row_index);

    logger.debug('Source retrieved', { sourceId: id, rowCount: rows.length });
    res.json({ source, rows });
  },

  upload: (req, res) => {
    const file = req.file;
    if (!file) {
      logger.warn('Upload attempted without file');
      return res.status(400).json({ error: 'file is required' });
    }

    const sources = store.get('sources').rows;
    const existing = sources.find(
      (row) => row.original_filename?.toLowerCase() === file.originalname.toLowerCase()
    );

    if (existing) {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      logger.warn('Duplicate source upload blocked', { originalName: file.originalname });
      return res.status(409).json({
        error: `File "${file.originalname}" has already been uploaded. Please delete the existing source before uploading it again.`
      });
    }

    const displayName = (req.body.name || file.originalname).trim();
    logger.info('Processing source upload', { originalName: file.originalname, displayName });
    const id = store.insert('sources', {
      name: displayName,
      original_filename: file.originalname,
      stored_path: file.path,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    let records = [];

    try {
      const workbook = XLSX.readFile(file.path, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      records = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    } catch (error) {
      logger.error('Failed to parse uploaded source file', error, { sourceId: id, path: file.path });
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      store.remove('sources', id);
      return res.status(400).json({ error: 'Could not read the uploaded file. Ensure it is a valid Excel document.' });
    }

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

    logger.info('Source uploaded successfully', {
      sourceId: id,
      rowCount: records.length,
      columnCount: records[0] ? Object.keys(records[0]).length : 0
    });

    res.json({ ok: true, source_id: id, rows: records.length });
  },

  remove: (req, res) => {
    const id = Number(req.params.id);
    const sources = store.get('sources');
    const exists = sources.rows.some((row) => row.id === id);
    if (!exists) {
      logger.warn('Attempted to remove missing source', { sourceId: id });
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

    logger.info('Source removed', { sourceId: id });

    res.json({ ok: true });
  },

  headers: (req, res) => {
    const id = Number(req.params.id);
    const rows = store
      .get('source_rows')
      .rows.filter((row) => row.source_id === id)
      .sort((a, b) => a.row_index - b.row_index);

    const headers = rows[0] ? Object.keys(rows[0].data || {}) : [];
    logger.debug('Source headers retrieved', { sourceId: id, headerCount: headers.length });
    res.json({ headers });
  }
};
