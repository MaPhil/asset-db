import { applyAssetPatches, ensureFieldOnAssets, getAssetPoolView } from './assetPool.js';
import { logger } from './logger.js';
import { store } from './storage.js';

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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

function normaliseFieldName(value) {
  return normaliseText(value);
}

function normaliseFieldValue(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return '';
  }
  const stringValue = String(rawValue);
  return stringValue;
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

function serialiseDefinition(node) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (node.type === 'rule') {
    const rule = normaliseRule(node);
    return rule;
  }
  return normaliseGroup(node);
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
        logger.warn('Invalid regular expression in manipulator rule', { pattern: rule.value });
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

function buildSnapshot() {
  const view = getAssetPoolView();
  const columns = Array.isArray(view?.columns) ? view.columns : [];
  const rows = Array.isArray(view?.rows) ? view.rows : [];
  return { columns, rows };
}

function buildManipulatorResponse(row, snapshot) {
  const definition = normaliseDefinition(row?.definition);
  const matches = snapshot.rows.filter((assetRow) => evaluateNode(definition, assetRow));
  return {
    id: row?.id ?? null,
    title: row?.title || `Manipulator ${row?.id ?? ''}`,
    description: row?.description || '',
    fieldName: row?.field_name || '',
    fieldValue: row?.field_value ?? '',
    definition,
    assetCount: matches.length,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
}

function applyManipulatorEffects(row, snapshot, previousRow = null) {
  const definition = normaliseDefinition(row?.definition);
  const fieldName = normaliseFieldName(row?.field_name);
  if (!fieldName) {
    return { matches: [], matchIds: [] };
  }

  ensureFieldOnAssets(fieldName);

  const matches = snapshot.rows.filter((assetRow) => evaluateNode(definition, assetRow));
  const matchIds = matches
    .map((assetRow) => assetRow.id)
    .filter((rowId) => rowId !== undefined && rowId !== null && rowId !== '');
  const matchIdSet = new Set(matchIds);
  const value = normaliseFieldValue(row?.field_value);

  const pendingUpdates = new Map();
  const queueUpdate = (rowId, patch) => {
    if (!rowId) {
      return;
    }
    const existing = pendingUpdates.get(rowId) ?? {};
    pendingUpdates.set(rowId, { ...existing, ...patch });
  };
  matchIds.forEach((rowId) => {
    queueUpdate(rowId, { [fieldName]: value });
  });

  const previousFieldName = normaliseFieldName(previousRow?.field_name);
  const previousManagedIds = new Set(
    Array.isArray(previousRow?.managed_row_ids) ? previousRow.managed_row_ids : []
  );

  if (previousFieldName && previousFieldName !== fieldName) {
    previousManagedIds.forEach((rowId) => {
      queueUpdate(rowId, { [previousFieldName]: '' });
    });
  } else if (previousFieldName === fieldName) {
    previousManagedIds.forEach((rowId) => {
      if (!rowId) {
        return;
      }
      if (!matchIdSet.has(rowId)) {
        queueUpdate(rowId, { [fieldName]: '' });
      }
    });
  }

  if (pendingUpdates.size) {
    const patches = Array.from(pendingUpdates.entries()).map(([assetId, patch]) => ({
      assetId,
      patch
    }));
    applyAssetPatches(patches);
  }

  return { matches, matchIds };
}

function runManipulatorEntry(entry) {
  const manipulatorId = Number(entry?.id);
  if (!Number.isFinite(manipulatorId)) {
    return null;
  }
  const snapshot = buildSnapshot();
  const previousRow = {
    field_name: getPreviousFieldNameForManipulator(entry),
    managed_row_ids: getPreviousManagedIds(entry)
  };
  const { matchIds } = applyManipulatorEffects(entry, snapshot, previousRow);
  const patch = {
    managed_row_ids: matchIds,
    managed_field_name: normaliseFieldName(entry?.field_name)
  };
  store.update('manipulators', manipulatorId, patch);
  return buildManipulatorResponse({ ...entry, ...patch }, snapshot);
}

function getPreviousFieldNameForManipulator(row) {
  const stored = row?.managed_field_name;
  if (stored && stored.trim()) {
    return normaliseFieldName(stored);
  }
  return normaliseFieldName(row?.field_name);
}

function getPreviousManagedIds(row) {
  return Array.isArray(row?.managed_row_ids) ? row.managed_row_ids : [];
}

export function calculateManipulators() {
  const table = store.get('manipulators');
  const entries = Array.isArray(table?.rows) ? table.rows : [];
  entries.forEach((entry) => {
    runManipulatorEntry(entry);
  });
}

export function executeManipulator(manipulatorId) {
  const table = store.get('manipulators');
  const entries = Array.isArray(table?.rows) ? table.rows : [];
  const entry = entries.find((row) => row?.id === Number(manipulatorId));
  if (!entry) {
    throw createError('Manipulator wurde nicht gefunden.', 404);
  }
  return runManipulatorEntry(entry);
}

function sortManipulators(entries) {
  return entries.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
}

export function listManipulators() {
  const snapshot = buildSnapshot();
  const table = store.get('manipulators');
  const entries = Array.isArray(table?.rows) ? table.rows : [];
  const manipulators = entries.map((row) => buildManipulatorResponse(row, snapshot));
  sortManipulators(manipulators);
  const columns = Array.isArray(snapshot?.columns)
    ? snapshot.columns
    : Array.isArray(snapshot?.fieldStats)
    ? snapshot.fieldStats.map((stat) => stat.field)
    : [];
  return {
    manipulators,
    fieldOptions: columns
  };
}

export function createManipulator(payload) {
  const title = normaliseText(payload?.title);
  if (!title) {
    throw createError('Für den Manipulator ist ein Titel erforderlich.');
  }

  const description = normaliseText(payload?.description);
  const fieldName = normaliseFieldName(payload?.fieldName);
  if (!fieldName) {
    throw createError('Für den Manipulator ist ein Feldname erforderlich.');
  }
  const rawFieldValue = payload?.fieldValue;
  const trimmedFieldValue = normaliseText(rawFieldValue);
  if (!trimmedFieldValue) {
    throw createError('Für den Manipulator ist ein Feldwert erforderlich.');
  }
  const fieldValue = normaliseFieldValue(rawFieldValue);
  const definition = serialiseDefinition(payload?.definition) ?? { type: 'group', mode: 'all', children: [] };

  const timestamp = new Date().toISOString();
  const rowPayload = {
    title,
    description,
    field_name: fieldName,
    field_value: fieldValue,
    definition,
    created_at: timestamp,
    updated_at: timestamp,
    managed_row_ids: [],
    managed_field_name: null
  };

  const manipulatorId = store.insert('manipulators', rowPayload);
  logger.info('Manipulator created', { manipulatorId, title });

  const snapshot = buildSnapshot();
  return buildManipulatorResponse({ id: manipulatorId, ...rowPayload }, snapshot);
}

export function updateManipulator(id, payload) {
  const manipulatorId = Number(id);
  if (!Number.isFinite(manipulatorId)) {
    throw createError('Ungültige Manipulator-ID.', 400);
  }

  const table = store.get('manipulators');
  const existing = table.rows.find((row) => row?.id === manipulatorId);
  if (!existing) {
    throw createError('Manipulator wurde nicht gefunden.', 404);
  }

  const title = normaliseText(payload?.title);
  if (!title) {
    throw createError('Für den Manipulator ist ein Titel erforderlich.');
  }

  const description = normaliseText(payload?.description);
  const fieldName = normaliseFieldName(payload?.fieldName);
  if (!fieldName) {
    throw createError('Für den Manipulator ist ein Feldname erforderlich.');
  }

  const rawFieldValue = payload?.fieldValue;
  const trimmedFieldValue = normaliseText(rawFieldValue);
  if (!trimmedFieldValue) {
    throw createError('Für den Manipulator ist ein Feldwert erforderlich.');
  }
  const fieldValue = normaliseFieldValue(rawFieldValue);

  const definition = serialiseDefinition(payload?.definition) ?? { type: 'group', mode: 'all', children: [] };
  const timestamp = new Date().toISOString();

  const patch = {
    title,
    description,
    field_name: fieldName,
    field_value: fieldValue,
    definition,
    updated_at: timestamp
  };

  store.update('manipulators', manipulatorId, patch);

  const snapshot = buildSnapshot();
  const merged = { ...existing, ...patch };

  logger.info('Manipulator updated', { manipulatorId, title });

  return buildManipulatorResponse(merged, snapshot);
}
