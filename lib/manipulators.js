import { getAssetPoolView } from './assetPool.js';
import { logger } from './logger.js';
import { store } from './storage.js';

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const ALLOWED_OPERATORS = new Set(['equals', 'not_equals', 'regex', 'greater', 'less', 'contains']);
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

function parseTokenList(value) {
  if (value === undefined || value === null) {
    return [];
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => entry.length > 0);
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

function evaluateRule(rule, row) {
  const rowValues = row?.values || {};
  const rowValue = stringValue(rowValues[rule.field]);
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
    case 'contains': {
      const targetTokens = parseTokenList(rule.value);
      if (!targetTokens.length) {
        return false;
      }
      const rowTokens = parseTokenList(rowValue);
      if (rowTokens.length) {
        return targetTokens.every((token) => rowTokens.includes(token));
      }
      const haystack = normalisedRow;
      return targetTokens.every((token) => haystack.includes(token));
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
    definition,
    assetCount: matches.length,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null
  };
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
  return {
    manipulators,
    fieldOptions: snapshot.columns
  };
}

export function createManipulator(payload) {
  const title = normaliseText(payload?.title);
  if (!title) {
    throw createError('Manipulator title is required.');
  }

  const description = normaliseText(payload?.description);
  const definition = serialiseDefinition(payload?.definition) ?? { type: 'group', mode: 'all', children: [] };

  const timestamp = new Date().toISOString();
  const rowPayload = {
    title,
    description,
    definition,
    created_at: timestamp,
    updated_at: timestamp
  };

  const manipulatorId = store.insert('manipulators', rowPayload);
  logger.info('Manipulator created', { manipulatorId, title });

  const snapshot = buildSnapshot();
  return buildManipulatorResponse({ id: manipulatorId, ...rowPayload }, snapshot);
}
