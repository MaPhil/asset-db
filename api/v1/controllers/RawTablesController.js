import fs from 'fs';
import XLSX from 'xlsx';

import { store } from '../../../lib/storage.js';
import { createPreview, deletePreview, readPreview } from '../../../lib/rawPreview.js';
import { getAssetFieldSuggestions, getAssetPoolView } from '../../../lib/assetPool.js';
import { logger } from '../../../lib/logger.js';

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
  const records = [];

  rows.forEach((cells = []) => {
    const record = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      const cell = Array.isArray(cells) ? cells[index] : undefined;
      const value = cell === undefined || cell === null ? '' : cell;

      if (!hasValue) {
        if (typeof value === 'string') {
          if (value.trim() !== '') {
            hasValue = true;
          }
        } else if (value !== '') {
          hasValue = true;
        }
      }

      record[header] = value;
    });

    if (hasValue) {
      records.push(record);
    }
  });

  return records;
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
    logger.debug('Roh-Tabellen werden aufgelistet');
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
      description: table.description || '',
      rowCount: rowsByTable[table.id] || 0
    }));

    res.json(response);
  },

  detail: (req, res) => {
    const id = Number(req.params.id);
    const table = store.get('raw_tables').rows.find((entry) => entry.id === id);
    if (!table) {
      logger.warn('Roh-Tabelle nicht gefunden', { rawTableId: id });
      return res.status(404).json({ error: 'Not found' });
    }

    const normalizedTable = {
      ...table,
      description: table.description || ''
    };

    const rows = store
      .get('raw_rows')
      .rows.filter((row) => row.raw_table_id === id)
      .sort((a, b) => a.row_index - b.row_index)
      .map((row) => ({ rowKey: row.row_key, rowIndex: row.row_index, data: row.data }));

    const mapping = store.get('raw_mappings').rows.find((entry) => entry.raw_table_id === id);

    logger.debug('Details der Roh-Tabelle abgerufen', {
      rawTableId: id,
      rowCount: rows.length,
      hasMapping: Boolean(mapping)
    });

    res.json({
      table: normalizedTable,
      rows,
      mapping: mapping ? mapping.pairs || [] : [],
      assetPool: getAssetPoolView()
    });
  },

  preview: (req, res) => {
    const file = req.file;
    if (!file) {
      logger.warn('Vorschau der Roh-Tabelle ohne Dateiupload versucht');
      return res.status(400).json({ error: 'File is required.' });
    }

    const { title, idColumn } = req.body;
    const duplicatePolicy = normalizePolicy(req.body.duplicatePolicy);
    const trimmedTitle = (title || '').trim();

    if (!trimmedTitle) {
      removeTempFile(file.path);
      logger.warn('Vorschau der Roh-Tabelle ohne Titel');
      return res.status(400).json({ fieldErrors: { title: 'Title is required.' } });
    }

    if (!isExcelFile(file.originalname)) {
      removeTempFile(file.path);
      logger.warn('Vorschau der Roh-Tabelle hat Nicht-Excel-Datei abgelehnt', {
        filename: file.originalname
      });
      return res
        .status(400)
        .json({ fieldErrors: { file: 'Please upload an Excel file (.xlsx).' } });
    }

    try {
      const workbook = XLSX.readFile(file.path, { cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        removeTempFile(file.path);
        logger.warn('Vorschau der Roh-Tabelle wegen leerer Arbeitsmappe fehlgeschlagen');
        return res.status(400).json({ error: 'Workbook contains no worksheets.' });
      }

      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (!rows.length) {
        removeTempFile(file.path);
        logger.warn('Vorschau der Roh-Tabelle wegen fehlender Zeilen fehlgeschlagen');
        return res.status(400).json({ error: 'Worksheet has no headers.' });
      }

      const rawHeaders = rows[0].map((value, index) => sanitizeHeader(value, index));
      const headerValidation = validateHeaders(rawHeaders);
      if (!headerValidation.ok) {
        removeTempFile(file.path);
        logger.warn('Vorschau der Roh-Tabelle scheiterte an Kopfzeilenprüfung', {
          reason: headerValidation.message
        });
        return res.status(400).json({ error: headerValidation.message });
      }

      const normalizedIdColumn = (idColumn || '').trim();
      if (normalizedIdColumn && !rawHeaders.includes(normalizedIdColumn)) {
        removeTempFile(file.path);
        logger.warn('Vorschau der Roh-Tabelle scheiterte wegen fehlender ID-Spalte', {
          idColumn: normalizedIdColumn
        });
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
        logger.warn('Vorschau der Roh-Tabelle scheiterte wegen Duplikatregel-Verstoß', {
          message: processed.message
        });
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

      logger.info('Vorschau der Roh-Tabelle erstellt', {
        previewId,
        title: trimmedTitle,
        rowCount: processed.rows.length
      });

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
      logger.error('Verarbeitung der Roh-Tabellen-Vorschau fehlgeschlagen', err, {
        filename: file?.originalname
      });
      res.status(400).json({ error: 'Could not read the file. Please upload a valid Excel (.xlsx).' });
    }
  },

  import: (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { previewId, mappings } = body;
    if (!previewId) {
      logger.warn('Import der Roh-Tabelle ohne Vorschau-ID versucht');
      return res.status(400).json({ error: 'Preview ID is required.' });
    }

    const preview = readPreview(previewId);
    if (!preview) {
      logger.warn('Import der Roh-Tabelle fehlgeschlagen, weil Vorschau nicht gefunden wurde', {
        previewId
      });
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
      logger.warn('Import der Roh-Tabelle wegen fehlender Zuordnungen abgelehnt', { previewId });
      return res.status(400).json({ error: 'Please map at least one column.' });
    }

    const validPairs = pairs.filter((pair) => preview.headers.includes(pair.rawHeader));

    if (!validPairs.length) {
      logger.warn('Import der Roh-Tabelle wegen ungültiger Kopfzeilen abgelehnt', { previewId });
      return res.status(400).json({ error: 'Mappings reference unknown headers.' });
    }

    const tableId = store.insert('raw_tables', {
      title: preview.title,
      sourceFileName: preview.sourceFileName,
      uploadedAt: preview.uploadedAt,
      headers: preview.headers,
      idColumn: preview.idColumn,
      duplicatePolicy: preview.duplicatePolicy,
      description: ''
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

    logger.info('Roh-Tabelle erfolgreich importiert', {
      rawTableId: tableId,
      rowCount: preview.rows.length,
      mappingCount: validPairs.length
    });

    res.json({ ok: true, rawTableId: tableId });
  },

  updateMapping: (req, res) => {
    const id = Number(req.params.id);
    const table = store.get('raw_tables').rows.find((entry) => entry.id === id);
    if (!table) {
      logger.warn('Versuch, Zuordnung für fehlende Roh-Tabelle zu aktualisieren', {
        rawTableId: id
      });
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
      logger.warn('Aktualisierung der Roh-Tabellen-Zuordnung wegen fehlender Zuordnungen abgelehnt', {
        rawTableId: id
      });
      return res.status(400).json({ error: 'Please map at least one column.' });
    }

    const invalidHeaders = pairs.filter((pair) => !table.headers.includes(pair.rawHeader));
    if (invalidHeaders.length) {
      logger.warn('Aktualisierung der Roh-Tabellen-Zuordnung wegen ungültiger Kopfzeilen abgelehnt', {
        rawTableId: id,
        invalidHeaders: invalidHeaders.map((pair) => pair.rawHeader)
      });
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

    logger.info('Zuordnung der Roh-Tabelle aktualisiert', { rawTableId: id, mappingCount: pairs.length });

    res.json({ ok: true });
  },

  updateDetails: (req, res) => {
    const id = Number(req.params.id);
    const tables = store.get('raw_tables');
    const table = tables.rows.find((entry) => entry.id === id);
    if (!table) {
      logger.warn('Versuch, Details für fehlende Roh-Tabelle zu aktualisieren', { rawTableId: id });
      return res.status(404).json({ error: 'Raw table not found.' });
    }

    const title = (req.body?.title || '').trim();
    const description = (req.body?.description || '').trim();

    if (!title) {
      logger.warn('Aktualisierung der Roh-Tabellen-Details wegen fehlendem Titel abgelehnt', {
        rawTableId: id
      });
      return res.status(400).json({ fieldErrors: { title: 'Name is required.' } });
    }

    table.title = title;
    table.description = description;
    store.set('raw_tables', tables);

    logger.info('Details der Roh-Tabelle aktualisiert', { rawTableId: id });

    res.json({
      ok: true,
      table: {
        ...table,
        description
      }
    });
  },

  delete: (req, res) => {
    const id = Number(req.params.id);
    const tables = store.get('raw_tables');
    const exists = tables.rows.some((entry) => entry.id === id);
    if (!exists) {
      logger.warn('Versuch, fehlende Roh-Tabelle zu löschen', { rawTableId: id });
      return res.status(404).json({ error: 'Raw table not found.' });
    }

    store.remove('raw_tables', id);

    const rows = store.get('raw_rows');
    const filteredRows = rows.rows.filter((row) => row.raw_table_id !== id);
    if (filteredRows.length !== rows.rows.length) {
      rows.rows = filteredRows;
      store.set('raw_rows', rows);
    }

    const mappings = store.get('raw_mappings');
    const filteredMappings = mappings.rows.filter((entry) => entry.raw_table_id !== id);
    if (filteredMappings.length !== mappings.rows.length) {
      mappings.rows = filteredMappings;
      store.set('raw_mappings', mappings);
    }

    logger.info('Roh-Tabelle gelöscht', { rawTableId: id });

    res.json({ ok: true });
  }
};
