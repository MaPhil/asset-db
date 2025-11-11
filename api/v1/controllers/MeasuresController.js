import fs from 'fs';
import XLSX from 'xlsx';

import { store } from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';
import { MEASURE_HEADERS } from '../../../lib/measuresHeaders.js';

class MeasuresImportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'MeasuresImportError';
    this.status = status;
  }
}

const HEADER_FIELD_MAP = {
  Themengebiet: 'topics',
  'Sub-Themengebiet': 'subTopics',
  'AssetUnterKategorien': 'categories',
  ID: 'identifier',
  'Vertraulichkeit_niedrig': 'confidentialityLow',
  'Vertraulichkeit_mittel': 'confidentialityMedium',
  'Vertraulichkeit_hoch': 'confidentialityHigh',
  'Vertraulichkeit_sehr_hoch': 'confidentialityVeryHigh',
  'Integrität_niedrig': 'integrityLow',
  'Integrität_mittel': 'integrityMedium',
  'Integrität_hoch': 'integrityHigh',
  'Integrität_sehr_hoch': 'integrityVeryHigh',
  'Verfügbarkeit_niedrig': 'availabilityLow',
  'Verfügbarkeit_mittel': 'availabilityMedium',
  'Verfügbarkeit_hoch': 'availabilityHigh',
  'Verfügbarkeit_sehr_hoch': 'availabilityVeryHigh',
  Sollanforderung: 'requirements',
  Ergänzung_Erläuterung: 'explanation',
  Zusätzli_Doku_IT: 'documentation',
  Vorgeschlagene_Standardantworten: 'standardAnswer'
};

const MEASURE_TABLES = {
  topics: 'measure_topics',
  subTopics: 'measure_sub_topics',
  categories: 'measure_categories',
  measures: 'measures',
  versions: 'measure_versions'
};

const DEFAULT_STATE = {
  id: 1,
  current_version_id: null,
  change_count: 0,
  version_date: null,
  updated_at: null
};

const normaliseString = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return String(value).trim();
};

const splitMultiValue = (value) => {
  const text = normaliseString(value);
  if (!text) {
    return [];
  }

  const parts = text
    .split(';')
    .map((part) => normaliseString(part))
    .filter((part) => part.length > 0);

  const seen = new Set();
  const result = [];

  parts.forEach((part) => {
    const key = part.toLocaleLowerCase('de-DE');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(part);
  });

  return result;
};

const toId = (value) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
};

const readMeasureState = () => {
  const table = store.get('measure_state');
  const rows = Array.isArray(table?.rows) ? table.rows : [];

  if (!rows.length) {
    const now = new Date().toISOString();
    const row = { ...DEFAULT_STATE, updated_at: now };
    const seq = Number.isFinite(table?.meta?.seq) ? Math.max(table.meta.seq, row.id) : row.id;
    store.set('measure_state', {
      meta: { ...(table?.meta || {}), seq },
      rows: [row]
    });
    return row;
  }

  return rows[0];
};

const writeMeasureState = (patch) => {
  const table = store.get('measure_state');
  const rows = Array.isArray(table?.rows) ? [...table.rows] : [];
  const base = rows[0] ? { ...rows[0] } : { ...DEFAULT_STATE };
  const updated = {
    ...base,
    ...patch,
    id: base.id || DEFAULT_STATE.id,
    updated_at: new Date().toISOString()
  };

  const seq = Number.isFinite(table?.meta?.seq)
    ? Math.max(table.meta.seq, updated.id)
    : updated.id;

  store.set('measure_state', {
    meta: { ...(table?.meta || {}), seq },
    rows: [updated]
  });

  return updated;
};

const fetchVersionRow = (versionId) => {
  const versions = store.get(MEASURE_TABLES.versions);
  return (Array.isArray(versions?.rows) ? versions.rows : []).find((row) => row.id === versionId) || null;
};

const buildMeasureResponse = ({ topicId, subTopicId, categoryId }) => {
  const state = readMeasureState();
  const versionId = toId(state.current_version_id);
  const response = {
    measures: [],
    filters: { topics: [], subTopics: [], categories: [] },
    version: {
      id: versionId,
      versionDate: state.version_date,
      changeCount: Number(state.change_count) || 0,
      measureCount: 0,
      sourceFilename: null
    }
  };

  if (!versionId) {
    return response;
  }

  const topicsTable = store.get(MEASURE_TABLES.topics);
  const subTopicsTable = store.get(MEASURE_TABLES.subTopics);
  const categoriesTable = store.get(MEASURE_TABLES.categories);
  const measuresTable = store.get(MEASURE_TABLES.measures);

  const topics = (Array.isArray(topicsTable?.rows) ? topicsTable.rows : []).filter(
    (row) => row.version_id === versionId
  );
  const subTopics = (Array.isArray(subTopicsTable?.rows) ? subTopicsTable.rows : []).filter(
    (row) => row.version_id === versionId
  );
  const categories = (Array.isArray(categoriesTable?.rows) ? categoriesTable.rows : []).filter(
    (row) => row.version_id === versionId
  );

  const topicMap = new Map(topics.map((row) => [row.id, row]));
  const subTopicMap = new Map(subTopics.map((row) => [row.id, row]));
  const categoryMap = new Map(categories.map((row) => [row.id, row]));

  const measures = (Array.isArray(measuresTable?.rows) ? measuresTable.rows : []).filter(
    (row) => row.version_id === versionId
  );

  const topicFilter = toId(topicId);
  const subTopicFilter = toId(subTopicId);
  const categoryFilter = toId(categoryId);

  const filtered = measures.filter((measure) => {
    if (topicFilter && !Array.isArray(measure.topic_ids)) {
      return false;
    }
    if (
      topicFilter &&
      !measure.topic_ids.some((id) => toId(id) === topicFilter)
    ) {
      return false;
    }

    if (subTopicFilter && !Array.isArray(measure.sub_topic_ids)) {
      return false;
    }
    if (
      subTopicFilter &&
      !measure.sub_topic_ids.some((id) => toId(id) === subTopicFilter)
    ) {
      return false;
    }

    if (categoryFilter && !Array.isArray(measure.category_ids)) {
      return false;
    }
    if (
      categoryFilter &&
      !measure.category_ids.some((id) => toId(id) === categoryFilter)
    ) {
      return false;
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aId = normaliseString(a.identifier || '');
    const bId = normaliseString(b.identifier || '');
    return aId.localeCompare(bId, 'de', { numeric: true, sensitivity: 'base' });
  });

  response.measures = sorted.map((measure) => ({
    id: measure.id,
    identifier: measure.identifier || '',
    topics: Array.isArray(measure.topic_ids)
      ? measure.topic_ids
          .map((id) => topicMap.get(toId(id))?.title)
          .filter(Boolean)
      : [],
    subTopics: Array.isArray(measure.sub_topic_ids)
      ? measure.sub_topic_ids
          .map((id) => subTopicMap.get(toId(id))?.title)
          .filter(Boolean)
      : [],
    categories: Array.isArray(measure.category_ids)
      ? measure.category_ids
          .map((id) => categoryMap.get(toId(id))?.title)
          .filter(Boolean)
      : [],
    confidentiality: {
      low: normaliseString(measure.confidentiality_low || ''),
      medium: normaliseString(measure.confidentiality_medium || ''),
      high: normaliseString(measure.confidentiality_high || ''),
      veryHigh: normaliseString(measure.confidentiality_very_high || '')
    },
    integrity: {
      low: normaliseString(measure.integrity_low || ''),
      medium: normaliseString(measure.integrity_medium || ''),
      high: normaliseString(measure.integrity_high || ''),
      veryHigh: normaliseString(measure.integrity_very_high || '')
    },
    availability: {
      low: normaliseString(measure.availability_low || ''),
      medium: normaliseString(measure.availability_medium || ''),
      high: normaliseString(measure.availability_high || ''),
      veryHigh: normaliseString(measure.availability_very_high || '')
    },
    requirements: normaliseString(measure.requirements || ''),
    explanation: normaliseString(measure.explanation || ''),
    documentation: normaliseString(measure.documentation || ''),
    standardAnswer: normaliseString(measure.standard_answer || '')
  }));

  response.filters.topics = [...topics]
    .sort((a, b) => normaliseString(a.title).localeCompare(normaliseString(b.title), 'de', { sensitivity: 'base' }))
    .map((row) => ({ id: row.id, title: row.title }));

  response.filters.subTopics = [...subTopics]
    .sort((a, b) => normaliseString(a.title).localeCompare(normaliseString(b.title), 'de', { sensitivity: 'base' }))
    .map((row) => ({ id: row.id, title: row.title }));

  response.filters.categories = [...categories]
    .sort((a, b) => normaliseString(a.title).localeCompare(normaliseString(b.title), 'de', { sensitivity: 'base' }))
    .map((row) => ({ id: row.id, title: row.title }));

  response.version.measureCount = measures.length;
  const versionRow = fetchVersionRow(versionId);
  if (versionRow) {
    response.version.versionDate = versionRow.version_date || response.version.versionDate;
    response.version.changeCount = Number(versionRow.change_count) || response.version.changeCount;
    response.version.sourceFilename = versionRow.source_filename || null;
  }

  return response;
};

const parseWorkbook = (filePath) => {
  let workbook;
  try {
    let xlsx_file = fs.readFileSync(filePath)
    workbook = XLSX.read(xlsx_file);
  } catch (error) {
    throw new MeasuresImportError(
      'Die hochgeladene Datei konnte nicht gelesen werden. Bitte stellen Sie sicher, dass es sich um eine gültige Excel-Datei handelt.'
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new MeasuresImportError('Die Excel-Datei enthält kein Arbeitsblatt.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });

  if (!rows.length) {
    return [];
  }

  const [rawHeader, ...body] = rows;
  const header = rawHeader.map((cell) => normaliseString(cell));
  const missing = MEASURE_HEADERS.filter((label) => !header.includes(label));

  if (missing.length) {
    throw new MeasuresImportError(
      `Die Datei enthält nicht alle erforderlichen Spalten: ${missing.join(', ')}.`
    );
  }

  const headerIndex = new Map();
  header.forEach((label, index) => {
    if (HEADER_FIELD_MAP[label]) {
      headerIndex.set(label, index);
    }
  });

  const entries = [];

  body.forEach((row) => {
    const record = {};

    MEASURE_HEADERS.forEach((label) => {
      const index = headerIndex.get(label);
      const rawValue = typeof index === 'number' ? row[index] : '';
      record[HEADER_FIELD_MAP[label]] = normaliseString(rawValue);
    });

    const entry = {
      topics: splitMultiValue(record.topics),
      subTopics: splitMultiValue(record.subTopics),
      categories: splitMultiValue(record.categories),
      identifier: record.identifier,
      confidentiality: {
        low: record.confidentialityLow,
        medium: record.confidentialityMedium,
        high: record.confidentialityHigh,
        veryHigh: record.confidentialityVeryHigh
      },
      integrity: {
        low: record.integrityLow,
        medium: record.integrityMedium,
        high: record.integrityHigh,
        veryHigh: record.integrityVeryHigh
      },
      availability: {
        low: record.availabilityLow,
        medium: record.availabilityMedium,
        high: record.availabilityHigh,
        veryHigh: record.availabilityVeryHigh
      },
      requirements: record.requirements,
      explanation: record.explanation,
      documentation: record.documentation,
      standardAnswer: record.standardAnswer
    };

    const hasValue =
      entry.identifier ||
      entry.requirements ||
      entry.explanation ||
      entry.documentation ||
      entry.standardAnswer ||
      entry.topics.length ||
      entry.subTopics.length ||
      entry.categories.length ||
      entry.confidentiality.low ||
      entry.confidentiality.medium ||
      entry.confidentiality.high ||
      entry.confidentiality.veryHigh ||
      entry.integrity.low ||
      entry.integrity.medium ||
      entry.integrity.high ||
      entry.integrity.veryHigh ||
      entry.availability.low ||
      entry.availability.medium ||
      entry.availability.high ||
      entry.availability.veryHigh;

    if (hasValue) {
      entries.push(entry);
    }
  });

  return entries;
};

const applyImport = (entries, originalName) => {
  const now = new Date().toISOString();
  const currentState = readMeasureState();
  const previousVersionId = toId(currentState.current_version_id);
  const changeCount = (Number(currentState.change_count) || 0) + 1;

  if (previousVersionId) {
    store.update(MEASURE_TABLES.versions, previousVersionId, {
      status: 'archived',
      archived_at: now
    });
  }

  const versionId = store.insert(MEASURE_TABLES.versions, {
    status: 'current',
    source_filename: originalName,
    created_at: now,
    version_date: now,
    change_count: changeCount,
    measure_count: entries.length
  });

  writeMeasureState({
    id: currentState.id || DEFAULT_STATE.id,
    current_version_id: versionId,
    change_count: changeCount,
    version_date: now
  });

  const topicCache = new Map();
  const subTopicCache = new Map();
  const categoryCache = new Map();

  const ensureEntry = (cache, table, title) => {
    const key = title.toLocaleLowerCase('de-DE');
    if (cache.has(key)) {
      return cache.get(key);
    }

    const payload = {
      version_id: versionId,
      title,
      created_at: now
    };
    const id = store.insert(table, payload);
    const entry = { id, title };
    cache.set(key, entry);
    return entry;
  };

  entries.forEach((entry) => {
    const topicIds = Array.from(
      new Set(entry.topics.map((title) => ensureEntry(topicCache, MEASURE_TABLES.topics, title).id))
    );
    const subTopicIds = Array.from(
      new Set(
        entry.subTopics.map((title) => ensureEntry(subTopicCache, MEASURE_TABLES.subTopics, title).id)
      )
    );
    const categoryIds = Array.from(
      new Set(
        entry.categories.map((title) => ensureEntry(categoryCache, MEASURE_TABLES.categories, title).id)
      )
    );

    store.insert(MEASURE_TABLES.measures, {
      version_id: versionId,
      identifier: entry.identifier || '',
      topic_ids: topicIds,
      sub_topic_ids: subTopicIds,
      category_ids: categoryIds,
      confidentiality_low: entry.confidentiality.low || '',
      confidentiality_medium: entry.confidentiality.medium || '',
      confidentiality_high: entry.confidentiality.high || '',
      confidentiality_very_high: entry.confidentiality.veryHigh || '',
      integrity_low: entry.integrity.low || '',
      integrity_medium: entry.integrity.medium || '',
      integrity_high: entry.integrity.high || '',
      integrity_very_high: entry.integrity.veryHigh || '',
      availability_low: entry.availability.low || '',
      availability_medium: entry.availability.medium || '',
      availability_high: entry.availability.high || '',
      availability_very_high: entry.availability.veryHigh || '',
      requirements: entry.requirements || '',
      explanation: entry.explanation || '',
      documentation: entry.documentation || '',
      standard_answer: entry.standardAnswer || '',
      created_at: now
    });
  });

  logger.info('Maßnahmenimport abgeschlossen', {
    versionId,
    measureCount: entries.length,
    changeCount,
    source: originalName
  });

  return {
    versionId,
    versionDate: now,
    changeCount,
    measureCount: entries.length,
    sourceFilename: originalName
  };
};

export const MeasuresController = {
  list: (req, res) => {
    try {
      const data = buildMeasureResponse({
        topicId: req.query.topic,
        subTopicId: req.query.subTopic,
        categoryId: req.query.category
      });
      res.json(data);
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
      const parsed = parseWorkbook(file.path);
      const summary = applyImport(parsed, file.originalname);
      res.json({ ok: true, version: summary });
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

