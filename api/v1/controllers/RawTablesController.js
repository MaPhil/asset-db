import fs from 'fs';
import XLSX from 'xlsx';

import { store } from '../../../lib/storage.js';
import { createPreview, deletePreview, readPreview } from '../../../lib/rawPreview.js';
import { getAssetFieldSuggestions, getAssetPoolView } from '../../../lib/assetPool.js';

function sanitizeHeader(value, index) {
  if (value === undefined || value === null) {
    return `Column ${index + 1}`;
  }
  const str = String(value).trim();
  return str || `Column ${index + 1}`;
}

function normalizePolicy(value) {
  return value === 'first' ? 'first' : 'error';
}

function isExcelFile(filename = '') {
  return filename.toLowerCase().endsWith('.xlsx');
}

function buildRecords(headers, rows) {
  return rows.map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });
}

function validateHeaders(headers) {
  if (!headers.length) {
    return { ok: false, message: 'Worksheet has no headers.' };
  }

  const seen = new Map();
  for (const header of headers) {
    const key = header.toLowerCase();
    if (seen.has(key)) {
      return {
        ok: false,
        message: `Duplicate header detected: "${header}". Please rename columns to be unique.`
      };
    }
    seen.set(key, true);
  }

  return { ok: true };
}

function processRows({ records, idColumn, duplicatePolicy }) {
  const processed = [];
  const seenKeys = new Set();
  const duplicates = new Set();

  records.forEach((record, index) => {
    const keyValue = idColumn ? record[idColumn] : index;
    const key = keyValue === undefined || keyValue === null ? '' : String(keyValue);
    if (idColumn) {
      if (seenKeys.has(key)) {
        if (duplicatePolicy === 'error') {
          duplicates.add(key);
        }
        return;
      }
      seenKeys.add(key);
    }

    processed.push({
      row_index: index,
      row_key: idColumn ? key : index,
      data: record
    });
  });

  if (duplicates.size > 0) {
    return {
      ok: false,
      message: `Duplicate IDs found: ${Array.from(duplicates).join(', ')}.`
    };
  }

  return {
    ok: true,
    rows: processed
  };
}

function removeTempFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export const RawTablesController = {
  list: (req, res) => {
    const tables = store.get('raw_tables');
    const rowsByTable = store.get('raw_rows').rows.reduce((acc, row) => {
      const key = row.raw_table_id;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const response = tables.rows.map((table) => ({
      id: table.id,
      title: table.title,
      uploadedAt: table.uploadedAt,
      sourceFileName: table.sourceFileName,
      rowCount: rowsByTable[table.id] || 0
    }));

    res.json(response);
  },

  detail: (req, res) => {
    const id = Number(req.params.id);
    const table = store.get('raw_tables').rows.find((entry) => entry.id === id);
    if (!table) {
      return res.status(404).json({ error: 'Not found' });
    }

    const rows = store
      .get('raw_rows')
      .rows.filter((row) => row.raw_table_id === id)
      .sort((a, b) => a.row_index - b.row_index)
      .map((row) => ({ rowKey: row.row_key, rowIndex: row.row_index, data: row.data }));

    const mapping = store.get('raw_mappings').rows.find((entry) => entry.raw_table_id === id);

    res.json({
      table,
      rows,
      mapping: mapping ? mapping.pairs || [] : [],
      assetPool: getAssetPoolView()
    });
  },

  preview: (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'File is required.' });
    }

    const { title, idColumn } = req.body;
    const duplicatePolicy = normalizePolicy(req.body.duplicatePolicy);
    const trimmedTitle = (title || '').trim();

    if (!trimmedTitle) {
      removeTempFile(file.path);
      return res.status(400).json({ fieldErrors: { title: 'Title is required.' } });
    }

    if (!isExcelFile(file.originalname)) {
      removeTempFile(file.path);
      return res
        .status(400)
        .json({ fieldErrors: { file: 'Please upload an Excel file (.xlsx).' } });
    }

    try {
      const workbook = XLSX.readFile(file.path, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        removeTempFile(file.path);
        return res.status(400).json({ error: 'Workbook contains no worksheets.' });
      }

      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (!rows.length) {
        removeTempFile(file.path);
        return res.status(400).json({ error: 'Worksheet has no headers.' });
      }

      const rawHeaders = rows[0].map((value, index) => sanitizeHeader(value, index));
      const headerValidation = validateHeaders(rawHeaders);
      if (!headerValidation.ok) {
        removeTempFile(file.path);
        return res.status(400).json({ error: headerValidation.message });
      }

      const normalizedIdColumn = (idColumn || '').trim();
      if (normalizedIdColumn && !rawHeaders.includes(normalizedIdColumn)) {
        removeTempFile(file.path);
        return res.status(400).json({
          fieldErrors: {
            idColumn: `ID column "${normalizedIdColumn}" not found in headers.`
          }
        });
      }

      const bodyRows = rows.slice(1);
      const records = buildRecords(rawHeaders, bodyRows);

      const processed = processRows({
        records,
        idColumn: normalizedIdColumn || null,
        duplicatePolicy
      });

      if (!processed.ok) {
        removeTempFile(file.path);
        return res.status(400).json({ error: processed.message });
      }

      const previewPayload = {
        title: trimmedTitle,
        sourceFileName: file.originalname,
        uploadedAt: new Date().toISOString(),
        headers: rawHeaders,
        idColumn: normalizedIdColumn || null,
        duplicatePolicy,
        rows: processed.rows
      };

      const { id: previewId } = createPreview(previewPayload);

      removeTempFile(file.path);

      res.json({
        previewId,
        title: trimmedTitle,
        sourceFileName: file.originalname,
        uploadedAt: previewPayload.uploadedAt,
        headers: rawHeaders,
        rowCount: processed.rows.length,
        duplicatePolicy,
        idColumn: previewPayload.idColumn,
        assetFieldSuggestions: getAssetFieldSuggestions()
      });
    } catch (err) {
      removeTempFile(file?.path);
      res.status(400).json({ error: 'Could not read the file. Please upload a valid Excel (.xlsx).' });
    }
  },

  import: (req, res) => {
    const { previewId, mappings } = req.body;
    if (!previewId) {
      return res.status(400).json({ error: 'Preview ID is required.' });
    }

    const preview = readPreview(previewId);
    if (!preview) {
      return res.status(404).json({ error: 'Preview not found. Please restart the import.' });
    }

    const pairs = Array.isArray(mappings)
      ? mappings
          .map((pair) => ({
            rawHeader: (pair?.rawHeader || '').trim(),
            assetField: (pair?.assetField || '').trim()
          }))
          .filter((pair) => pair.rawHeader && pair.assetField)
      : [];

    if (!pairs.length) {
      return res.status(400).json({ error: 'Please map at least one column.' });
    }

    const validPairs = pairs.filter((pair) => preview.headers.includes(pair.rawHeader));

    if (!validPairs.length) {
      return res.status(400).json({ error: 'Mappings reference unknown headers.' });
    }

    const tableId = store.insert('raw_tables', {
      title: preview.title,
      sourceFileName: preview.sourceFileName,
      uploadedAt: preview.uploadedAt,
      headers: preview.headers,
      idColumn: preview.idColumn,
      duplicatePolicy: preview.duplicatePolicy
    });

    for (const row of preview.rows) {
      store.insert('raw_rows', {
        raw_table_id: tableId,
        row_index: row.row_index,
        row_key: row.row_key,
        data: row.data
      });
    }

    store.insert('raw_mappings', {
      raw_table_id: tableId,
      pairs: validPairs
    });

    deletePreview(previewId);

    res.json({ ok: true, rawTableId: tableId });
  },

  updateMapping: (req, res) => {
    const id = Number(req.params.id);
    const table = store.get('raw_tables').rows.find((entry) => entry.id === id);
    if (!table) {
      return res.status(404).json({ error: 'Raw table not found.' });
    }

    const pairs = Array.isArray(req.body?.mappings)
      ? req.body.mappings
          .map((pair) => ({
            rawHeader: (pair?.rawHeader || '').trim(),
            assetField: (pair?.assetField || '').trim()
          }))
          .filter((pair) => pair.rawHeader && pair.assetField)
      : [];

    if (!pairs.length) {
      return res.status(400).json({ error: 'Please map at least one column.' });
    }

    const invalidHeaders = pairs.filter((pair) => !table.headers.includes(pair.rawHeader));
    if (invalidHeaders.length) {
      return res.status(400).json({ error: 'Mappings reference unknown headers.' });
    }

    const mappingStore = store.get('raw_mappings');
    const existing = mappingStore.rows.find((entry) => entry.raw_table_id === id);

    if (existing) {
      existing.pairs = pairs;
      store.set('raw_mappings', mappingStore);
    } else {
      store.insert('raw_mappings', { raw_table_id: id, pairs });
    }

    res.json({ ok: true });
  }
};
