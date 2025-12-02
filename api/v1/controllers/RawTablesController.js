import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import XLSX from 'xlsx';

import { createPreview, deletePreview, readPreview } from '../../../lib/rawPreview.js';
import {
  getAssetFieldSuggestions,
  getAssetPoolView,
  upsertAssets,
  updateAssets
} from '../../../lib/assetPool.js';
import { archiveRawAsset, listRawAssets, readRawAsset, saveRawAsset } from '../../../lib/rawAssetStore.js';
import { ARCHIVED_RAW_ASSETS_DIR, RAW_ASSETS_DIR } from '../../../lib/storage.js';
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
    return { ok: false, message: 'Arbeitsblatt enthält keine Kopfzeilen.' };
  }

  const seen = new Map();
  for (const header of headers) {
    const key = header.toLowerCase();
    if (seen.has(key)) {
      return {
        ok: false,
        message: `Doppelte Kopfzeile erkannt: "${header}". Bitte benennen Sie die Spalten eindeutig um.`
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
      message: `Doppelte IDs gefunden: ${Array.from(duplicates).join(', ')}.`
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

function resolveAssetId(row, idStrategy, fallbackIndex) {
  if (row && row.__assetId) {
    return row.__assetId;
  }
  if (idStrategy?.type === 'column' && idStrategy.column) {
    const value = row[idStrategy.column];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return randomUUID();
}

function mappingPairsToObject(pairs) {
  return pairs.reduce((acc, pair) => {
    acc[pair.rawHeader] = pair.assetField;
    return acc;
  }, {});
}

function buildAssetPoolEntries({ uploadId, rows, mapping, idStrategy }) {
  const entries = [];
  rows.forEach((row, index) => {
    const assetId = resolveAssetId(row, idStrategy, index);
    const data = { archived: false, uploadId, rowIndex: index };
    Object.entries(mapping).forEach(([rawHeader, assetField]) => {
      data[assetField] = row[rawHeader];
    });
    entries.push({ id: assetId, data });
  });
  return entries;
}

export const RawTablesController = {
  list: (req, res) => {
    logger.debug('Roh-Tabellen werden aufgelistet');
    const { active, archived } = listRawAssets({ includeArchived: true });
    const items = [];

    active.forEach((id) => {
      const doc = readRawAsset(id, { archivedPreferred: false });
      if (!doc) return;
      items.push({
        id,
        title: doc.meta?.title || id,
        uploadedAt: doc.meta?.uploadedAt,
        rowCount: Array.isArray(doc.data) ? doc.data.length : 0,
        archived: false
      });
    });

    archived.forEach((id) => {
      const doc = readRawAsset(id, { archivedPreferred: true });
      if (!doc) return;
      items.push({
        id,
        title: doc.meta?.title || id,
        uploadedAt: doc.meta?.uploadedAt,
        rowCount: Array.isArray(doc.data) ? doc.data.length : 0,
        archived: true
      });
    });

    items.sort((a, b) => (a.uploadedAt || '').localeCompare(b.uploadedAt || ''));

    res.json(items);
  },

  detail: (req, res) => {
    const id = req.params.id;
    const activePath = path.join(RAW_ASSETS_DIR, `${id}.json`);
    const archivedPath = path.join(ARCHIVED_RAW_ASSETS_DIR, `${id}.json`);
    const doc = readRawAsset(id, { archivedPreferred: !fs.existsSync(activePath) });

    if (!doc) {
      logger.warn('Roh-Tabelle nicht gefunden', { rawTableId: id });
      return res.status(404).json({ error: 'Nicht gefunden.' });
    }

    const mappingPairs = Object.entries(doc.meta?.mapping || {}).map(([rawHeader, assetField]) => ({
      rawHeader,
      assetField
    }));

    const rows = Array.isArray(doc.data)
      ? doc.data.map((row, index) => ({
          rowKey: row.__assetId || index,
          rowIndex: index,
          data: row
        }))
      : [];

    res.json({
      table: {
        id,
        title: doc.meta?.title || '',
        description: doc.meta?.description || '',
        uploadedAt: doc.meta?.uploadedAt,
        sourceFileName: doc.meta?.sourceFileName,
        headers: doc.meta?.headers || [],
        archived: !fs.existsSync(activePath) && fs.existsSync(archivedPath)
      },
      rows,
      mapping: mappingPairs,
      assetPool: getAssetPoolView({ includeArchived: true })
    });
  },

  preview: (req, res) => {
    const file = req.file;
    if (!file) {
      logger.warn('Vorschau der Roh-Tabelle ohne Dateiupload versucht');
      return res.status(400).json({ error: 'Datei ist erforderlich.' });
    }

    const { title, idColumn } = req.body;
    const duplicatePolicy = normalizePolicy(req.body.duplicatePolicy);
    const trimmedTitle = (title || '').trim();

    if (!trimmedTitle) {
      removeTempFile(file.path);
      logger.warn('Vorschau der Roh-Tabelle ohne Titel');
      return res.status(400).json({ fieldErrors: { title: 'Titel ist erforderlich.' } });
    }

    if (!isExcelFile(file.originalname)) {
      removeTempFile(file.path);
      logger.warn('Vorschau der Roh-Tabelle hat Nicht-Excel-Datei abgelehnt', {
        filename: file.originalname
      });
      return res
        .status(400)
        .json({ fieldErrors: { file: 'Bitte laden Sie eine Excel-Datei (.xlsx) hoch.' } });
    }

    try {
      const workbook = XLSX.read(file.buffer || fs.readFileSync(file.path));
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        removeTempFile(file.path);
        logger.warn('Vorschau der Roh-Tabelle wegen leerer Arbeitsmappe fehlgeschlagen');
        return res.status(400).json({ error: 'Arbeitsmappe enthält keine Arbeitsblätter.' });
      }

      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (!rows.length) {
        removeTempFile(file.path);
        logger.warn('Vorschau der Roh-Tabelle wegen fehlender Zeilen fehlgeschlagen');
        return res.status(400).json({ error: 'Arbeitsblatt enthält keine Kopfzeilen.' });
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
            idColumn: `ID-Spalte "${normalizedIdColumn}" wurde in den Kopfzeilen nicht gefunden.`
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
        uploadId: randomUUID(),
        title: trimmedTitle,
        sourceFileName: file.originalname,
        uploadedAt: new Date().toISOString(),
        headers: rawHeaders,
        idColumn: normalizedIdColumn || null,
        idStrategy: normalizedIdColumn ? { type: 'column', column: normalizedIdColumn } : { type: 'uuid' },
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
        assetFieldSuggestions: getAssetFieldSuggestions(),
        idStrategy: previewPayload.idStrategy
      });
    } catch (err) {
      removeTempFile(file?.path);
      logger.error('Verarbeitung der Roh-Tabellen-Vorschau fehlgeschlagen', err, {
        filename: file?.originalname
      });
      res
        .status(400)
        .json({ error: 'Datei konnte nicht gelesen werden. Bitte laden Sie eine gültige Excel-Datei (.xlsx) hoch.' });
    }
  },

  import: (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { previewId, mappings } = body;
    if (!previewId) {
      logger.warn('Import der Roh-Tabelle ohne Vorschau-ID versucht');
      return res.status(400).json({ error: 'Vorschau-ID ist erforderlich.' });
    }

    const preview = readPreview(previewId);
    if (!preview) {
      logger.warn('Import der Roh-Tabelle fehlgeschlagen, weil Vorschau nicht gefunden wurde', {
        previewId
      });
      return res
        .status(404)
        .json({ error: 'Vorschau nicht gefunden. Bitte starten Sie den Import neu.' });
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
      return res.status(400).json({ error: 'Bitte ordnen Sie mindestens eine Spalte zu.' });
    }

    const validPairs = pairs.filter((pair) => preview.headers.includes(pair.rawHeader));

    if (!validPairs.length) {
      logger.warn('Import der Roh-Tabelle wegen ungültiger Kopfzeilen abgelehnt', { previewId });
      return res.status(400).json({ error: 'Zuordnungen verweisen auf unbekannte Kopfzeilen.' });
    }

    const mappingObject = mappingPairsToObject(validPairs);

    const uploadId = preview.uploadId || randomUUID();
    const idStrategy = preview.idStrategy || (preview.idColumn ? { type: 'column', column: preview.idColumn } : { type: 'uuid' });

    const storedRows = [];
    const entries = [];

    preview.rows.forEach((row, index) => {
      const assetId = resolveAssetId(row.data, idStrategy, index);
      const dataRecord = { ...row.data, __assetId: assetId };
      storedRows.push(dataRecord);

      const assetData = { archived: false, uploadId, rowIndex: index };
      Object.entries(mappingObject).forEach(([rawHeader, assetField]) => {
        assetData[assetField] = row.data[rawHeader];
      });

      entries.push({ id: assetId, data: assetData });
    });

    saveRawAsset(uploadId, {
      meta: {
        uploadId,
        title: preview.title,
        sourceFileName: preview.sourceFileName,
        uploadedAt: preview.uploadedAt,
        headers: preview.headers,
        idColumn: preview.idColumn,
        idStrategy,
        duplicatePolicy: preview.duplicatePolicy,
        mapping: mappingObject
      },
      data: storedRows
    });

    upsertAssets(entries);

    deletePreview(previewId);

    logger.info('Roh-Tabelle erfolgreich importiert', {
      rawTableId: uploadId,
      rowCount: storedRows.length,
      mappingCount: validPairs.length
    });

    res.json({ ok: true, rawTableId: uploadId });
  },

  updateMapping: (req, res) => {
    const id = req.params.id;
    const doc = readRawAsset(id, { archivedPreferred: false });
    if (!doc) {
      logger.warn('Versuch, Zuordnung für fehlende Roh-Tabelle zu aktualisieren', {
        rawTableId: id
      });
      return res.status(404).json({ error: 'Roh-Tabelle nicht gefunden.' });
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
      return res.status(400).json({ error: 'Bitte ordnen Sie mindestens eine Spalte zu.' });
    }

    const invalidHeaders = pairs.filter((pair) => !doc.meta?.headers?.includes(pair.rawHeader));
    if (invalidHeaders.length) {
      logger.warn('Aktualisierung der Roh-Tabellen-Zuordnung wegen ungültiger Kopfzeilen abgelehnt', {
        rawTableId: id,
        invalidHeaders: invalidHeaders.map((pair) => pair.rawHeader)
      });
      return res.status(400).json({ error: 'Zuordnungen verweisen auf unbekannte Kopfzeilen.' });
    }

    doc.meta.mapping = mappingPairsToObject(pairs);
    saveRawAsset(id, doc);

    const entries = buildAssetPoolEntries({
      uploadId: doc.meta.uploadId || id,
      rows: doc.data || [],
      mapping: doc.meta.mapping,
      idStrategy: doc.meta.idStrategy || (doc.meta.idColumn ? { type: 'column', column: doc.meta.idColumn } : { type: 'uuid' })
    });

    upsertAssets(entries);

    logger.info('Zuordnung der Roh-Tabelle aktualisiert', { rawTableId: id, mappingCount: pairs.length });

    res.json({ ok: true });
  },

  updateDetails: (req, res) => {
    const id = req.params.id;
    const doc = readRawAsset(id, { archivedPreferred: false });
    if (!doc) {
      logger.warn('Versuch, Details für fehlende Roh-Tabelle zu aktualisieren', { rawTableId: id });
      return res.status(404).json({ error: 'Roh-Tabelle nicht gefunden.' });
    }

    const title = (req.body?.title || '').trim();
    const description = (req.body?.description || '').trim();

    if (!title) {
      logger.warn('Aktualisierung der Roh-Tabellen-Details wegen fehlendem Titel abgelehnt', {
        rawTableId: id
      });
      return res.status(400).json({ fieldErrors: { title: 'Name ist erforderlich.' } });
    }

    doc.meta.title = title;
    doc.meta.description = description;
    saveRawAsset(id, doc);

    logger.info('Details der Roh-Tabelle aktualisiert', { rawTableId: id });

    res.json({
      ok: true,
      table: {
        ...doc.meta,
        id,
        description
      }
    });
  },

  delete: (req, res) => {
    const id = req.params.id;
    const doc = readRawAsset(id, { archivedPreferred: false });
    if (!doc) {
      logger.warn('Versuch, fehlende Roh-Tabelle zu löschen', { rawTableId: id });
      return res.status(404).json({ error: 'Roh-Tabelle nicht gefunden.' });
    }

    const archivedDoc = archiveRawAsset(id) || doc;
    const assetIds = (archivedDoc.data || [])
      .map((row, index) => row.__assetId || resolveAssetId(row, archivedDoc.meta?.idStrategy, index))
      .filter(Boolean);

    if (assetIds.length) {
      updateAssets(assetIds, { archived: true });
    }

    logger.info('Roh-Tabelle archiviert', { rawTableId: id, assetCount: assetIds.length });

    res.json({ ok: true });
  }
};
