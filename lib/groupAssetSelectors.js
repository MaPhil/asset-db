import { getAssetPoolView } from './assetPool.js';
import { logger } from './logger.js';
import { store } from './storage.js';

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireGroup(groupSlug) {
  const slug = typeof groupSlug === 'string' ? groupSlug.trim() : '';
  if (!slug) {
    throw createError('Invalid group identifier.', 400);
  }

  const groups = store.get('groups').rows;
  const group = groups.find((row) => row.slug === slug);
  if (!group) {
    throw createError('Group not found.', 404);
  }
  return group;
}

const ALLOWED_OPERATORS = new Set(['equals', 'not_equals', 'regex', 'greater', 'less']);
const ALLOWED_MODES = new Set(['all', 'any']);

function normaliseMode(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ALLOWED_MODES.has(raw) ? raw : 'all';
}

function normaliseText(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function normaliseRule(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }

  const field = normaliseText(node.field);
  if (!field) {
    return null;
  }

  const operatorRaw = typeof node.operator === 'string' ? node.operator.trim().toLowerCase() : '';
  const operator = ALLOWED_OPERATORS.has(operatorRaw) ? operatorRaw : 'equals';

  const value = node.value ?? '';
  return {
    type: 'rule',
    field,
    operator,
    value: typeof value === 'string' ? value : String(value)
  };
}

function normaliseGroup(node) {
  if (!node || typeof node !== 'object') {
    return {
      type: 'group',
      mode: 'all',
      children: []
    };
  }

  const children = Array.isArray(node.children) ? node.children : [];
  const normalisedChildren = [];
  children.forEach((child) => {
    if (child && typeof child === 'object') {
      if (child.type === 'group' || child.children) {
        const groupChild = normaliseGroup(child);
        if (groupChild.children.length || groupChild.mode) {
          normalisedChildren.push(groupChild);
        }
      } else {
        const ruleChild = normaliseRule(child);
        if (ruleChild) {
          normalisedChildren.push(ruleChild);
        }
      }
    }
  });

  return {
    type: 'group',
    mode: normaliseMode(node.mode ?? node.matches),
    children: normalisedChildren
  };
}

function normaliseDefinition(definition) {
  return normaliseGroup(definition);
}

function stringValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '')).join(', ');
  }
  if (typeof value === 'object') {
    return Object.values(value)
      .map((entry) => String(entry ?? ''))
      .join(', ');
  }
  return String(value);
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getAssetFieldValue(row, field) {
  if (!row || typeof row !== 'object') {
    return '';
  }
  if (Object.prototype.hasOwnProperty.call(row, field)) {
    return row[field];
  }
  const values = row.values;
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    return values[field];
  }
  return '';
}

function evaluateRule(rule, row) {
  const rawFieldValue = getAssetFieldValue(row, rule.field);
  const rowValue = stringValue(rawFieldValue);
  const normalisedRow = rowValue.trim().toLowerCase();
  const normalisedTarget = String(rule.value ?? '').trim().toLowerCase();

  switch (rule.operator) {
    case 'equals':
      return normalisedRow === normalisedTarget;
    case 'not_equals':
      return normalisedRow !== normalisedTarget;
    case 'regex': {
      try {
        const pattern = String(rule.value ?? '');
        if (!pattern) {
          return false;
        }
        const regex = new RegExp(pattern, 'i');
        return regex.test(rowValue);
      } catch (error) {
        logger.warn('Invalid regular expression in asset selector rule', { pattern: rule.value });
        return false;
      }
    }
    case 'greater': {
      const rowNumber = numericValue(rowValue);
      const targetNumber = numericValue(rule.value);
      if (rowNumber === null || targetNumber === null) {
        return false;
      }
      return rowNumber > targetNumber;
    }
    case 'less': {
      const rowNumber = numericValue(rowValue);
      const targetNumber = numericValue(rule.value);
      if (rowNumber === null || targetNumber === null) {
        return false;
      }
      return rowNumber < targetNumber;
    }
    default:
      return false;
  }
}

function evaluateNode(node, row) {
  if (!node || typeof node !== 'object') {
    return true;
  }
  if (node.type === 'rule') {
    return evaluateRule(node, row);
  }
  if (!Array.isArray(node.children) || node.children.length === 0) {
    return true;
  }
  if (node.mode === 'any') {
    return node.children.some((child) => evaluateNode(child, row));
  }
  return node.children.every((child) => evaluateNode(child, row));
}

const ASSET_ROW_META_FIELDS = new Set([
  'id',
  'rawTableId',
  'rawTableTitle',
  'rowIndex',
  'rowKey',
  'values'
]);

function buildAssetRowValues(row) {
  const result = {};
  if (!row || typeof row !== 'object') {
    return result;
  }
  Object.keys(row).forEach((key) => {
    if (ASSET_ROW_META_FIELDS.has(key)) {
      return;
    }
    result[key] = row[key];
  });
  return result;
}

function buildSnapshot() {
  const view = getAssetPoolView();
  const columns = Array.isArray(view?.columns) ? view.columns : [];
  const rows = Array.isArray(view?.rows) ? view.rows : [];
  return { columns, rows };
}

function buildSelectorResponse(row, snapshot) {
  const definition = normaliseDefinition(row?.definition);
  const matches = snapshot.rows.filter((assetRow) => evaluateNode(definition, assetRow));
  return {
    id: row?.id ?? null,
    name: row?.name || `Selector ${row?.id ?? ''}`,
    description: row?.description || '',
    definition,
    assetCount: matches.length,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

function getAssetId(row) {
  if (!row) {
    return null;
  }
  const value = row.id;
  if (value === undefined || value === null) {
    return null;
  }
  return String(value);
}

function findSelectorRow(groupSlug, selectorId) {
  const slug = typeof groupSlug === 'string' ? groupSlug.trim() : '';
  if (!slug) {
    throw createError('Invalid group identifier.', 400);
  }
  const id = Number(selectorId);
  if (!Number.isInteger(id) || id <= 0) {
    throw createError('Invalid selector identifier.', 400);
  }
  const table = store.get('group_asset_selectors');
  const row = table.rows.find((entry) => entry.id === id && entry?.group_slug === slug);
  if (!row) {
    throw createError('Asset selector was not found.', 404);
  }
  return row;
}

function serialiseDefinition(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (node.type === 'rule') {
    const rule = normaliseRule(node);
    return rule;
  }
  const group = normaliseGroup(node);
  return group;
}

export function getGroupAssetSelectorOverview(groupSlug) {
  const group = requireGroup(groupSlug);
  const snapshot = buildSnapshot();
  const table = store.get('group_asset_selectors');
  const rows = table.rows.filter((row) => row?.group_slug === group.slug);
  const selectors = rows.map((row) => buildSelectorResponse(row, snapshot));
  selectors.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  return {
    group: {
      slug: group.slug,
      name: group.title || group.name || ''
    },
    selectors,
    fieldOptions: snapshot.columns
  };
}

export function listGroupAssetSelectors(groupSlug) {
  return getGroupAssetSelectorOverview(groupSlug);
}

export function createGroupAssetSelector(groupSlug, payload) {
  const group = requireGroup(groupSlug);
  const name = normaliseText(payload?.name);
  if (!name) {
    throw createError('Asset selector name is required.');
  }

  const description = normaliseText(payload?.description);
  const definition = serialiseDefinition(payload?.definition) ?? { type: 'group', mode: 'all', children: [] };

  const timestamp = new Date().toISOString();
  const rowPayload = {
    group_slug: group.slug,
    name,
    description,
    definition,
    created_at: timestamp,
    updated_at: timestamp
  };

  const selectorId = store.insert('group_asset_selectors', rowPayload);
  logger.info('Asset selector created', { groupSlug: group.slug, selectorId, name });

  const snapshot = buildSnapshot();
  return buildSelectorResponse({ id: selectorId, ...rowPayload }, snapshot);
}

export function updateGroupAssetSelector(groupSlug, selectorId, payload) {
  const group = requireGroup(groupSlug);
  const existing = findSelectorRow(group.slug, selectorId);

  const name = normaliseText(payload?.name) || existing.name || '';
  if (!name) {
    throw createError('Asset selector name is required.');
  }
  const description = normaliseText(payload?.description);
  const definition = serialiseDefinition(payload?.definition) ?? normaliseDefinition(existing.definition);

  const timestamp = new Date().toISOString();
  const patch = {
    name,
    description,
    definition,
    updated_at: timestamp
  };
  store.update('group_asset_selectors', existing.id, patch);
  logger.info('Asset selector updated', { groupSlug: group.slug, selectorId: existing.id });

  const snapshot = buildSnapshot();
  return buildSelectorResponse({ ...existing, ...patch }, snapshot);
}

export function getGroupAssetSelectorAssets(groupSlug, selectorId) {
  const group = requireGroup(groupSlug);
  const existing = findSelectorRow(group.slug, selectorId);
  const snapshot = buildSnapshot();
  const definition = normaliseDefinition(existing.definition);
  const rows = snapshot.rows.filter((row) => evaluateNode(definition, row));
  return {
    selector: {
      id: existing.id,
      name: existing.name || `Selector ${existing.id}`,
      description: existing.description || ''
    },
    columns: snapshot.columns,
    rows: rows.map((row) => ({
      id: row.id,
      rawTableId: row.rawTableId,
      rawTableTitle: row.rawTableTitle,
      rowIndex: row.rowIndex,
      rowKey: row.rowKey,
      values: buildAssetRowValues(row)
    }))
  };
}

export function calculateGroupAssetCoverage() {
  const snapshot = buildSnapshot();
  const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
  const matchedAssets = new Set();

  const groupsTable = store.get('groups');
  const groupRows = Array.isArray(groupsTable?.rows) ? groupsTable.rows : [];

  const selectorsTable = store.get('group_asset_selectors');
  const selectorRows = Array.isArray(selectorsTable?.rows) ? selectorsTable.rows : [];

  const groups = groupRows.map((group) => {
    const groupSelectors = selectorRows.filter((selector) => selector?.group_slug === group.slug);
    const groupMatched = new Set();
    groupSelectors.forEach((selector) => {
      const definition = normaliseDefinition(selector.definition);
      rows.forEach((assetRow) => {
        if (!evaluateNode(definition, assetRow)) {
          return;
        }
        const assetId = getAssetId(assetRow);
        if (!assetId) {
          return;
        }
        groupMatched.add(assetId);
        matchedAssets.add(assetId);
      });
    });
    return {
      slug: group.slug,
      title: group.title || group.name || group.slug,
      assetCount: groupMatched.size
    };
  });

  const unmatchedCount = rows.reduce((count, row) => {
    const assetId = getAssetId(row);
    if (!assetId) {
      return count + 1;
    }
    if (!matchedAssets.has(assetId)) {
      return count + 1;
    }
    return count;
  }, 0);

  return {
    totalAssets: rows.length,
    unmatchedCount,
    groups
  };
}
