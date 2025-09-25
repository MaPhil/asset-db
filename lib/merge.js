import leven from 'leven';
import { store } from './storage.js';
import { logger } from './logger.js';

const normalize = (value) =>
  (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const candidateKeys = ['hostname', 'asset name', 'name', 'device', 'system'];

function pickMergeKey(fields) {
  for (const candidate of candidateKeys) {
    const match = Object.keys(fields).find((key) => key.toLowerCase() === candidate);
    if (match && fields[match]) {
      return fields[match];
    }
  }
  const firstString = Object.values(fields).find((value) => typeof value === 'string' && value.trim());
  return firstString ?? null;
}

export function rebuildUnified() {
  logger.info('Rebuilding unified assets');
  // Reset unified table
  store.set('unified_assets', { meta: { seq: 0 }, rows: [] });

  const sources = store.get('sources').rows;
  const schemaCols = store.get('schema').rows.map((row) => row.col_name);
  const mappings = store.get('mappings').rows;

  logger.debug('Loaded data for rebuild', {
    sourceCount: sources.length,
    schemaColumnCount: schemaCols.length,
    mappingCount: mappings.length
  });

  const mappingBySource = new Map();
  for (const mapping of mappings) {
    if (!mappingBySource.has(mapping.source_id)) {
      mappingBySource.set(mapping.source_id, {});
    }
    mappingBySource.get(mapping.source_id)[mapping.source_col] = mapping.unified_col;
  }

  const sourceRows = store.get('source_rows').rows;
  const normalized = [];

  for (const source of sources) {
    const columnMap = mappingBySource.get(source.id) || {};
    const rows = sourceRows
      .filter((row) => row.source_id === source.id)
      .sort((a, b) => a.row_index - b.row_index);

    logger.debug('Processing source rows for unified rebuild', {
      sourceId: source.id,
      rowCount: rows.length
    });

    for (const row of rows) {
      const unifiedFields = {};
      const dataEntries = Object.entries(row.data || {});
      for (const [sourceCol, value] of dataEntries) {
        const unifiedCol = columnMap[sourceCol];
        if (unifiedCol) {
          unifiedFields[unifiedCol] = value;
        }
      }

      for (const schemaCol of schemaCols) {
        if (!(schemaCol in unifiedFields)) {
          unifiedFields[schemaCol] = null;
        }
      }

      const mergeKey = pickMergeKey(unifiedFields);
      normalized.push({
        canonical: mergeKey ? normalize(mergeKey) : null,
        fields: unifiedFields,
        source_id: source.id
      });
    }
  }

  const clusters = [];
  const distanceThreshold = 2;

  for (const entry of normalized) {
    if (!entry.canonical) {
      clusters.push({ canonical: null, items: [entry] });
      continue;
    }

    const existing = clusters.find(
      (cluster) =>
        cluster.canonical &&
        (cluster.canonical === entry.canonical || leven(cluster.canonical, entry.canonical) <= distanceThreshold)
    );

    if (existing) {
      existing.items.push(entry);
      if (!existing.canonical || entry.canonical.length < existing.canonical.length) {
        existing.canonical = entry.canonical;
      }
    } else {
      clusters.push({ canonical: entry.canonical, items: [entry] });
    }
  }

  const unified = store.get('unified_assets');

  for (const cluster of clusters) {
    const mergedFields = {};
    for (const item of cluster.items) {
      for (const [key, value] of Object.entries(item.fields)) {
        const hasValue = value !== null && value !== '';
        const existingValue = mergedFields[key];
        if (hasValue && (existingValue === undefined || existingValue === null || existingValue === '')) {
          mergedFields[key] = value;
        }
      }
    }

    const id = (unified.meta.seq ?? 0) + 1;
    unified.meta.seq = id;
    const timestamp = new Date().toISOString();
    unified.rows.push({
      id,
      canonical_name: cluster.canonical,
      fields: mergedFields,
      source_ids: [...new Set(cluster.items.map((item) => item.source_id))],
      created_at: timestamp,
      updated_at: timestamp
    });
  }

  store.set('unified_assets', unified);
  logger.info('Unified assets rebuilt', {
    unifiedCount: unified.rows.length,
    clusterCount: clusters.length
  });
}
