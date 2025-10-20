import { store } from './storage.js';
import { logger } from './logger.js';

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
  const fieldRecords = store.get('asset_pool_fields').rows;
  const cellRecords = store.get('asset_pool_cells').rows;

  const tableById = new Map(rawTables.map((table) => [table.id, table]));
  const mappingByTable = new Map(
    rawMappings.map((mapping) => [mapping.raw_table_id, Array.isArray(mapping.pairs) ? mapping.pairs : []])
  );

  const assetFields = buildAssetFieldOrder(rawMappings);
  const fieldSettings = {};
  const manualFieldEntries = [];
  const manualSeen = new Set();

  for (const record of fieldRecords) {
    const field = record?.field;
    if (!field) {
      continue;
    }
    const name = String(field);
    const manual = record.manual === true;
    const editable = record.editable === true;
    fieldSettings[name] = {
      editable,
      manual
    };
    if (manual && !manualSeen.has(name)) {
      manualSeen.add(name);
      let order = Number.isFinite(record.position) ? record.position : null;
      if (order === null && typeof record.created_at === 'string') {
        const timestamp = Date.parse(record.created_at);
        if (Number.isFinite(timestamp)) {
          order = timestamp;
        }
      }
      if (order === null && Number.isFinite(record.id)) {
        order = record.id;
      }
      manualFieldEntries.push({ name, order: order ?? manualFieldEntries.length });
    }
  }

  manualFieldEntries.sort((a, b) => {
    if (a.order === b.order) {
      return a.name.localeCompare(b.name);
    }
    return a.order - b.order;
  });
  const manualFields = manualFieldEntries.map((entry) => entry.name);

  const ensureFieldTracked = (map, field) => {
    if (!field) {
      return;
    }
    if (!map.has(field)) {
      map.set(field, 0);
    }
  };

  const fieldCounts = new Map();
  assetFields.forEach((field) => ensureFieldTracked(fieldCounts, field));
  manualFields.forEach((field) => ensureFieldTracked(fieldCounts, field));
  Object.keys(fieldSettings).forEach((field) => ensureFieldTracked(fieldCounts, field));

  const overridesByRow = new Map();
  for (const record of cellRecords) {
    const rowId = record?.row_id;
    const field = record?.field;
    if (!rowId || !field) {
      continue;
    }
    ensureFieldTracked(fieldCounts, field);
    if (!overridesByRow.has(rowId)) {
      overridesByRow.set(rowId, {});
    }
    overridesByRow.get(rowId)[field] = record.value ?? '';
  }

  const rows = [];
  const missingTables = new Set();

  for (const row of rawRows) {
    const tableId = row.raw_table_id;
    const table = tableById.get(tableId);
    if (!table) {
      if (!missingTables.has(tableId)) {
        missingTables.add(tableId);
        logger.warn('Rohzeile verweist auf fehlende Tabelle', { rawTableId: tableId });
      }
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

    const overrides = overridesByRow.get(globalId);
    if (overrides) {
      for (const [field, overrideValue] of Object.entries(overrides)) {
        values[field] = overrideValue;
      }
    }

    for (const manualField of manualFields) {
      if (!(manualField in values)) {
        values[manualField] = '';
      }
    }

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

  const columns = [];
  const pushColumn = (field) => {
    if (!field || columns.includes(field)) {
      return;
    }
    columns.push(field);
  };

  assetFields.forEach((field) => {
    if ((fieldCounts.get(field) || 0) > 0 || fieldSettings[field]?.editable) {
      pushColumn(field);
    }
  });
  manualFields.forEach((field) => pushColumn(field));
  for (const field of fieldCounts.keys()) {
    if ((fieldCounts.get(field) || 0) > 0) {
      pushColumn(field);
    }
  }
  for (const [field, config] of Object.entries(fieldSettings)) {
    if (config.editable) {
      pushColumn(field);
    }
  }

  const statOrder = [];
  const pushStat = (field) => {
    if (!field || statOrder.includes(field)) {
      return;
    }
    statOrder.push(field);
  };

  assetFields.forEach(pushStat);
  manualFields.forEach(pushStat);
  Object.keys(fieldSettings).forEach(pushStat);
  for (const field of fieldCounts.keys()) {
    pushStat(field);
  }

  const fieldStats = statOrder.map((field) => ({ field, count: fieldCounts.get(field) || 0 }));

  return {
    columns,
    rows,
    fieldStats,
    fieldSettings
  };
}

export function getAssetFieldSuggestions() {
  const rawMappings = store.get('raw_mappings').rows;
  const order = buildAssetFieldOrder(rawMappings);
  return order;
}
