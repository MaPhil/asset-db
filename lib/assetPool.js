import { store } from './storage.js';

function buildAssetFieldOrder(rawMappings) {
  const order = [];
  const seen = new Set();
  for (const mapping of rawMappings) {
    const pairs = Array.isArray(mapping.pairs) ? mapping.pairs : [];
    for (const pair of pairs) {
      const assetField = pair?.assetField;
      if (assetField && !seen.has(assetField)) {
        seen.add(assetField);
        order.push(assetField);
      }
    }
  }
  return order;
}

function coerceRowKey(value, index) {
  if (value === undefined || value === null || value === '') {
    return String(index);
  }
  return String(value);
}

function hasMeaningfulValue(value) {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  return true;
}

export function getAssetPoolView() {
  const rawTables = store.get('raw_tables').rows;
  const rawRows = store.get('raw_rows').rows;
  const rawMappings = store.get('raw_mappings').rows;

  const tableById = new Map(rawTables.map((table) => [table.id, table]));
  const mappingByTable = new Map(
    rawMappings.map((mapping) => [mapping.raw_table_id, Array.isArray(mapping.pairs) ? mapping.pairs : []])
  );

  const assetFields = buildAssetFieldOrder(rawMappings);
  const fieldCounts = new Map(assetFields.map((field) => [field, 0]));

  const rows = [];

  for (const row of rawRows) {
    const tableId = row.raw_table_id;
    const table = tableById.get(tableId);
    if (!table) {
      continue;
    }

    const pairs = mappingByTable.get(tableId) || [];
    const rowData = row.data || {};
    const values = {};

    if (pairs.length) {
      const tableAssetFields = [];
      const seenFields = new Set();

      for (const pair of pairs) {
        const field = pair?.assetField;
        if (field && !seenFields.has(field)) {
          seenFields.add(field);
          tableAssetFields.push(field);
        }
      }

      for (const assetField of tableAssetFields) {
        values[assetField] = '';
      }

      for (const pair of pairs) {
        const { rawHeader, assetField } = pair || {};
        if (!assetField || !rawHeader) {
          continue;
        }
        if (!(assetField in values)) {
          continue;
        }
        const currentValue = values[assetField];
        if (currentValue) {
          continue;
        }
        const rawValue = rowData[rawHeader];
        if (hasMeaningfulValue(rawValue)) {
          values[assetField] = rawValue;
        }
      }
    }

    const globalId = `${tableId}:${coerceRowKey(row.row_key, row.row_index)}`;

    rows.push({
      id: globalId,
      rawTableId: tableId,
      rawTableTitle: table.title,
      rowKey: row.row_key,
      rowIndex: row.row_index,
      values
    });

    for (const [field, value] of Object.entries(values)) {
      if (hasMeaningfulValue(value)) {
        fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
      }
    }
  }

  const visibleFields = assetFields.filter((field) => (fieldCounts.get(field) || 0) > 0);

  return {
    columns: visibleFields,
    rows,
    fieldStats: assetFields.map((field) => ({ field, count: fieldCounts.get(field) || 0 }))
  };
}

export function getAssetFieldSuggestions() {
  const rawMappings = store.get('raw_mappings').rows;
  const order = buildAssetFieldOrder(rawMappings);
  return order;
}
