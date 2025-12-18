import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import XLSX from 'xlsx';

import {
  ARCHIVED_MEASURES_DIR,
  ASSET_SUB_CATEGORIES_FILE,
  MEASURES_FILE,
  ensureDirectoryExists,
  readJsonFile,
  writeJsonFile
} from '../../../lib/storage.js';
import { slugify, ensureUniqueSlug } from '../../../lib/assetStructure.js';
import { logger } from '../../../lib/logger.js';

const normaliseText = (value) => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value == null) {
    return '';
  }

  return String(value).trim();
};

const parseSemicolonList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normaliseText(entry))
      .map((entry) => entry.replace(/^;+|;+$/g, ''))
      .filter(Boolean);
  }

  if (value === undefined || value === null) {
    return [];
  }

  return String(value)
    .split(';')
    .map((entry) => normaliseText(entry))
    .map((entry) => entry.replace(/^;+|;+$/g, ''))
    .filter(Boolean);
};

const parseAssetSubCategories = (value) => {
  const entries = parseSemicolonList(value);
  const seen = new Set();
  const result = [];

  entries.forEach((entry) => {
    const normalized = normaliseText(entry);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
};

const parseBooleanFlag = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return numeric > 0;
    }
    return ['true', 'yes', 'ja', 'x', 'checked'].includes(trimmed.toLowerCase());
  }

  if (typeof value === 'number') {
    return value > 0;
  }

  return Boolean(value);
};

const buildRiskFlags = (row, prefix) => ({
  low: parseBooleanFlag(row[`${prefix}_niedrig`]),
  middle: parseBooleanFlag(row[`${prefix}_mittel`]),
  high: parseBooleanFlag(row[`${prefix}_hoch`]),
  very_high: parseBooleanFlag(row[`${prefix}_sehr_hoch`])
});

const writeAssetSubCategories = (uploadId, payload) => {
  const existing = readJsonFile(ASSET_SUB_CATEGORIES_FILE, { data: {} });
  const assetSubCategoryMap = new Map();

  const buildLinkKey = (topicTitle, subTopicTitle) => {
    const topicKey = normaliseText(topicTitle) || '__fallback__';
    const subTopicKey = normaliseText(subTopicTitle) || '__fallback__';
    return `${topicKey}||${subTopicKey}`;
  };

  const convertLinksToSet = (links) => {
    const linkSet = new Set();
    (Array.isArray(links) ? links : []).forEach((link) => {
      linkSet.add(buildLinkKey(link?.topicTitle, link?.subTopicTitle));
    });
    return linkSet;
  };

  const buildRecordFromRow = (slug, previous = {}) => ({
    slug,
    title: previous.title || '',
    name: previous.name || '',
    owner: previous.owner || '',
    group_owner: previous.group_owner || '',
    integrity: previous.integrity || {},
    availability: previous.availability || {},
    confidentiality: previous.confidentiality || {},
    description: previous.description || '',
    groups: Array.isArray(previous.groups) ? previous.groups : [],
    implementation_measures: previous.implementation_measures || {},
    measure_hashes: previous.measure_hashes || {},
    links: convertLinksToSet(previous.links),
    sub_topic: normaliseText(previous.sub_topic) || ''
  });

  Object.entries(existing.data || {}).forEach(([key, row]) => {
    const normalizedRow = row && typeof row === 'object' ? row : {};
    const storedSlug = normaliseText(normalizedRow.slug) || normaliseText(key);
    if (!storedSlug) {
      return;
    }
    assetSubCategoryMap.set(storedSlug, buildRecordFromRow(storedSlug, normalizedRow));
  });

  const usedSlugs = new Set(assetSubCategoryMap.keys());

  payload.rows.forEach((row) => {
    const topicTitles = parseSemicolonList(row?.Themengebiet);
    const subTopicTitles = parseSemicolonList(row?.['Sub-Themengebiet']);
    const categories = parseAssetSubCategories(row?.AssetUnterKategorien);
    const measureId = payload.idHeader ? String(row[payload.idHeader] ?? '').trim() : '';
    const measureHash = payload.headers ? hashRow(payload.headers, row) : '';

    if (!categories.length) {
      return;
    }

    const topicKeys = topicTitles.length ? topicTitles : [null];
    const subTopicKeys = subTopicTitles.length ? subTopicTitles : [null];

    categories.forEach((categoryTitle) => {
      const normalizedTitle = normaliseText(categoryTitle);
      if (!normalizedTitle) {
        return;
      }

      const rawSlug = slugify(normalizedTitle) || '';
      const slugBase =
        rawSlug || `assetunterkategorie-${assetSubCategoryMap.size + 1}`;
      let slug = slugBase;

      if (!assetSubCategoryMap.has(slug)) {
        slug = ensureUniqueSlug(usedSlugs, slugBase, `assetunterkategorie-${usedSlugs.size + 1}`);
        assetSubCategoryMap.set(slug, buildRecordFromRow(slug, {}));
      }

      const record = assetSubCategoryMap.get(slug);
      if (!record) {
        return;
      }

      record.title = normalizedTitle;
      record.name = normalizedTitle;

      if (Array.isArray(subTopicTitles) && subTopicTitles.length) {
        record.sub_topic = subTopicTitles[0];
      }

      record.description = normaliseText(row?.Sollanforderung) || record.description;
      record.integrity = buildRiskFlags(row, 'Integrität');
      record.availability = buildRiskFlags(row, 'Verfügbarkeit');
      record.confidentiality = buildRiskFlags(row, 'Vertraulichkeit');

      topicKeys.forEach((topic) => {
        subTopicKeys.forEach((subTopic) => {
          const topicKey = normaliseText(topic) || '__fallback__';
          const subTopicKey = normaliseText(subTopic) || '__fallback__';
          record.links.add(`${topicKey}||${subTopicKey}`);
        });
      });

      if (measureId && measureHash) {
        const previousHash = record.measure_hashes?.[measureId]?.current || null;
        record.measure_hashes[measureId] = {
          previous:
            previousHash && previousHash !== measureHash
              ? previousHash
              : record.measure_hashes?.[measureId]?.previous || null,
          current: measureHash
        };
      }

      assetSubCategoryMap.set(slug, record);
    });
  });

  const data = {};

  assetSubCategoryMap.forEach((record, slug) => {
    const links = Array.from(record.links ?? []).map((key) => {
      const [topicKey = '__fallback__', subTopicKey = '__fallback__'] = key.split('||');
      return {
        topicTitle: topicKey === '__fallback__' ? null : topicKey,
        subTopicTitle: subTopicKey === '__fallback__' ? null : subTopicKey
      };
    });

    data[slug] = {
      slug,
      groups: Array.isArray(record.groups) ? record.groups : [],
      sub_topic: normaliseText(record.sub_topic) || '',
      implementation_measures: record.implementation_measures || {},
      measure_hashes: record.measure_hashes || {},
      name: normaliseText(record.name) || record.title || '',
      description: normaliseText(record.description) || '',
      owner: normaliseText(record.owner) || '',
      group_owner: normaliseText(record.group_owner) || '',
      integrety: record.integrity || {},
      availability: record.availability || {},
      confidentiality: record.confidentiality || {},
      links
    };
  });

  writeJsonFile(ASSET_SUB_CATEGORIES_FILE, {
    meta: {
      ...(existing.meta || {}),
      uploadId,
      uploadedAt: payload.uploadedAt,
      sourceFileName: payload.sourceFileName,
      updatedAt: new Date().toISOString()
    },
    data
  });
};

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
      const idHeader = headers.find((header) => header.trim() === 'ID');
      if (!idHeader) {
        const error = new Error('Die Datei muss eine Spalte namens "ID" enthalten.');
        error.status = 400;
        throw error;
      }

      const seenIds = new Set();
      const meaningfulRows = [];

      rows.forEach((row, index) => {
        const hasValues = headers.some((header) => normaliseText(row[header]));
        if (!hasValues) {
          return;
        }

        const id = normaliseText(row[idHeader]);
        if (!id) {
          const error = new Error(
            `Zeile ${index + 2} enthält keine ID. Bitte stellen Sie sicher, dass jede Zeile eine eindeutige ID in der Spalte "ID" hat.`
          );
          error.status = 400;
          throw error;
        }

        if (seenIds.has(id)) {
          const error = new Error(
            `Die ID "${id}" ist mehrfach vorhanden. Bitte stellen Sie sicher, dass jede Zeile eine eindeutige ID in der Spalte "ID" hat.`
          );
          error.status = 400;
          throw error;
        }

        seenIds.add(id);
        meaningfulRows.push(row);
      });

      const uploadId = randomUUID();
      archiveExistingMeasures(uploadId);
      const uploadedAt = new Date().toISOString();

      const data = {};

      meaningfulRows.forEach((row) => {
        const hash = hashRow(headers, row);
        data[hash] = row;
      });

      const payload = {
        uploadId,
        uploadedAt,
        sourceFileName: file.originalname,
        headers,
        data
      };

      writeAssetSubCategories(uploadId, {
        rows: meaningfulRows,
        headers,
        idHeader,
        uploadedAt,
        sourceFileName: file.originalname
      });
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
