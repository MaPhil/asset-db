import fs from 'fs';
import XLSX from 'xlsx';

import { store } from '../../../lib/storage.js';
import { rebuildUnified } from '../../../lib/merge.js';
import { logger } from '../../../lib/logger.js';

export const SourcesController = {
  list: (req, res) => {
    logger.debug('Quellen werden aufgelistet');
    res.json(store.get('sources').rows);
  },

  get: (req, res) => {
    const id = Number(req.params.id);
    const source = store.get('sources').rows.find((row) => row.id === id);
    if (!source) {
      logger.warn('Quelle nicht gefunden', { sourceId: id });
      return res.status(404).json({ error: 'Nicht gefunden.' });
    }

    const rows = store
      .get('source_rows')
      .rows.filter((row) => row.source_id === id)
      .sort((a, b) => a.row_index - b.row_index);

    logger.debug('Quelle abgerufen', { sourceId: id, rowCount: rows.length });
    res.json({ source, rows });
  },

  upload: (req, res) => {
    const file = req.file;
    if (!file) {
      logger.warn('Upload ohne Datei versucht');
      return res.status(400).json({ error: 'Datei ist erforderlich.' });
    }

    const filePath = file.path;

    const sources = store.get('sources').rows;
    const existing = sources.find(
      (row) => row.original_filename?.toLowerCase() === file.originalname.toLowerCase()
    );

    if (existing) {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      logger.warn('Doppelter Quellen-Upload blockiert', { originalName: file.originalname });
      return res.status(409).json({
        error: `Die Datei "${file.originalname}" wurde bereits hochgeladen. Bitte löschen Sie die vorhandene Quelle, bevor Sie sie erneut hochladen.`
      });
    }

    const displayName = (req.body.name || file.originalname).trim();
    logger.info('Quellen-Upload wird verarbeitet', { originalName: file.originalname, displayName });
    const id = store.insert('sources', {
      name: displayName,
      original_filename: file.originalname,
      stored_path: file.path,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    let records = [];

    try {
      const xlsx_file = fs.readFileSync(filePath);
      const workbook = XLSX.read(xlsx_file);
      const sheetName = workbook.SheetNames[0];
      records = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    } catch (error) {
      logger.error('Hochgeladene Quelldatei konnte nicht gelesen werden', error, {
        sourceId: id,
        path: file.path
      });
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      store.remove('sources', id);
      return res
        .status(400)
        .json({ error: 'Die hochgeladene Datei konnte nicht gelesen werden. Bitte stellen Sie sicher, dass es sich um ein gültiges Excel-Dokument handelt.' });
    }

    if (!Array.isArray(records) || !records.length) {
      logger.warn('Hochgeladene Quelldatei enthält keine Daten', { sourceId: id });
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      store.remove('sources', id);
      return res.status(400).json({ error: 'Die hochgeladene Datei ist leer oder fehlerhaft formatiert.' });
    }

    const seenIds = new Set();
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      if (!Object.prototype.hasOwnProperty.call(record, 'ID')) {
        logger.warn('ID-Spalte fehlt in der Quelldatei', { sourceId: id, rowIndex: index });
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        store.remove('sources', id);
        return res
          .status(400)
          .json({ error: 'Jede Zeile muss eine "ID"-Spalte enthalten. Bitte passen Sie die Datei an und versuchen Sie es erneut.' });
      }

      const value = record.ID;
      const normalized = value === undefined || value === null ? '' : String(value).trim();
      if (!normalized) {
        logger.warn('Leere ID in der Quelldatei gefunden', { sourceId: id, rowIndex: index });
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        store.remove('sources', id);
        return res
          .status(400)
          .json({ error: `ID darf nicht leer sein (Zeile ${index + 2}). Bitte verwenden Sie eindeutige Werte.` });
      }

      if (seenIds.has(normalized)) {
        logger.warn('Doppelte ID in der Quelldatei gefunden', { sourceId: id, duplicateId: normalized });
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        store.remove('sources', id);
        return res
          .status(400)
          .json({ error: `Die ID "${normalized}" ist doppelt vorhanden. Bitte verwenden Sie eindeutige IDs.` });
      }

      seenIds.add(normalized);
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

    logger.info('Quelle erfolgreich hochgeladen', {
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
      logger.warn('Versuch, fehlende Quelle zu entfernen', { sourceId: id });
      return res.status(404).json({ error: 'Nicht gefunden.' });
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

    logger.info('Quelle entfernt', { sourceId: id });

    res.json({ ok: true });
  },

  headers: (req, res) => {
    const id = Number(req.params.id);
    const rows = store
      .get('source_rows')
      .rows.filter((row) => row.source_id === id)
      .sort((a, b) => a.row_index - b.row_index);

    const headers = rows[0] ? Object.keys(rows[0].data || {}) : [];
    logger.debug('Quellen-Header abgerufen', { sourceId: id, headerCount: headers.length });
    res.json({ headers });
  }
};
