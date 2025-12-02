import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import XLSX from 'xlsx';

import {
  ARCHIVED_MEASURES_DIR,
  MEASURES_FILE,
  ensureDirectoryExists,
  readJsonFile,
  writeJsonFile
} from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';

function parseWorkbook(file) {
  const workbook = XLSX.read(file.buffer || fs.readFileSync(file.path));
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Arbeitsmappe enthält keine Arbeitsblätter.');
  }
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (!rows.length) {
    throw new Error('Die Datei enthält keine Zeilen.');
  }
  const headers = rows[0].map((header, index) => String(header || `Column ${index + 1}`).trim());
  const dataRows = rows.slice(1).map((cells = []) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = Array.isArray(cells) ? cells[index] ?? '' : '';
    });
    return row;
  });
  return { headers, rows: dataRows };
}

function hashRow(headers, row) {
  const concatenated = headers.map((header) => String(row[header] ?? '')).join('|');
  return createHash('sha256').update(concatenated).digest('hex');
}

function archiveExistingMeasures(uploadId) {
  if (!fs.existsSync(MEASURES_FILE)) {
    return null;
  }
  ensureDirectoryExists(ARCHIVED_MEASURES_DIR);
  const target = path.join(ARCHIVED_MEASURES_DIR, `${uploadId}.json`);
  const payload = readJsonFile(MEASURES_FILE);
  fs.renameSync(MEASURES_FILE, target);
  return payload;
}

export const MeasuresController = {
  list: (_req, res) => {
    try {
      const payload = readJsonFile(MEASURES_FILE, null);
      if (!payload) {
        return res.json({ measures: [], filters: { topics: [], subTopics: [], categories: [] }, version: null });
      }
      const measures = Object.entries(payload.data || {}).map(([hash, row]) => ({ id: hash, ...row }));
      const version = {
        uploadedAt: payload.uploadedAt || null,
        uploadId: payload.uploadId || null,
        sourceFileName: payload.sourceFileName || null,
        measureCount: measures.length
      };
      res.json({
        measures,
        headers: Array.isArray(payload.headers) ? payload.headers : [],
        filters: { topics: [], subTopics: [], categories: [] },
        version
      });
    } catch (error) {
      logger.error('Fehler beim Laden der Maßnahmen', error);
      res.status(500).json({ error: 'Maßnahmen konnten nicht geladen werden.' });
    }
  },

  upload: (req, res) => {
    const file = req.file;
    if (!file) {
      logger.warn('Upload ohne Datei für Maßnahmen erkannt');
      return res.status(400).json({ error: 'Bitte wählen Sie eine Excel-Datei zum Hochladen aus.' });
    }

    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      logger.warn('Maßnahmen-Upload mit falschem Dateityp blockiert', {
        originalName: file.originalname
      });
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res
        .status(400)
        .json({ error: 'Bitte laden Sie eine Excel-Datei im XLSX-Format hoch.' });
    }

    logger.info('Maßnahmen-Upload gestartet', { originalName: file.originalname });

    try {
      const { headers, rows } = parseWorkbook(file);
      const uploadId = randomUUID();
      archiveExistingMeasures(uploadId);

      const data = {};
      rows.forEach((row) => {
        const hash = hashRow(headers, row);
        data[hash] = row;
      });

      const payload = {
        uploadId,
        uploadedAt: new Date().toISOString(),
        sourceFileName: file.originalname,
        headers,
        data
      };

      writeJsonFile(MEASURES_FILE, payload);
      res.json({
        ok: true,
        version: {
          uploadedAt: payload.uploadedAt,
          uploadId,
          sourceFileName: payload.sourceFileName,
          measureCount: Object.keys(data).length
        }
      });
    } catch (error) {
      const status = error.status && Number.isInteger(error.status) ? error.status : 500;
      const message =
        status >= 500
          ? 'Die Maßnahmen konnten nicht importiert werden. Bitte versuchen Sie es erneut.'
          : error.message;
      logger.error('Fehler beim Maßnahmen-Upload', error, { originalName: file.originalname });
      res.status(status).json({ error: message });
    } finally {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }
  }
};
