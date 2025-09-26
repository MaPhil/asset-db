import { getAssetPoolView } from './assetPool.js';
import { logger } from './logger.js';
import { store } from './storage.js';
import { getSetting, removeSetting, setSetting } from './settings.js';

const SETTINGS_KEY = 'assetTypeField';
const DECISIONS_TABLE = 'asset_type_decisions';

function normaliseField(field) {
  if (field === undefined || field === null) {
    return null;
  }
  const value = String(field).trim();
  return value ? value : null;
}

function normaliseName(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function normaliseDecision(value) {
  return value === 'ignore' ? 'ignore' : 'use';
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

function getDecisionsMap() {
  const data = store.get(DECISIONS_TABLE);
  const map = new Map();
  data.rows.forEach((row) => {
    const name = normaliseName(row?.asset_type);
    if (!name) {
      return;
    }
    map.set(name, {
      decision: normaliseDecision(row?.decision),
      comment: typeof row?.comment === 'string' ? row.comment : ''
    });
  });
  return map;
}

function resetAssetTypeDecisions() {
  const data = store.get(DECISIONS_TABLE);
  if (Array.isArray(data.rows) && data.rows.length) {
    logger.info('Clearing stored asset type decisions because the asset type field changed');
    data.rows = [];
    store.set(DECISIONS_TABLE, data);
  }
}

function collectAssetTypeCounts(field) {
  const view = getAssetPoolView();
  const rows = Array.isArray(view?.rows) ? view.rows : [];
  const counts = new Map();

  rows.forEach((row) => {
    const value = row?.values?.[field];
    if (!hasMeaningfulValue(value)) {
      return;
    }
    const name = normaliseName(value);
    if (!name) {
      return;
    }
    counts.set(name, (counts.get(name) || 0) + 1);
  });

  return { counts, view };
}

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function getAssetTypeField() {
  return normaliseField(getSetting(SETTINGS_KEY));
}

export function setAssetTypeField(field) {
  const nextField = normaliseField(field);
  const currentField = getAssetTypeField();

  if (!nextField) {
    if (currentField) {
      removeSetting(SETTINGS_KEY);
      resetAssetTypeDecisions();
      logger.info('Cleared asset type field setting');
    }
    return null;
  }

  if (currentField === nextField) {
    return currentField;
  }

  setSetting(SETTINGS_KEY, nextField);
  resetAssetTypeDecisions();
  logger.info('Updated asset type field setting', { field: nextField });
  return nextField;
}

export function getAssetTypeSummary() {
  const field = getAssetTypeField();
  if (!field) {
    return { field: null, entries: [] };
  }

  const { counts } = collectAssetTypeCounts(field);
  const decisions = getDecisionsMap();

  const entries = Array.from(counts.entries())
    .map(([name, count]) => {
      const decision = decisions.get(name);
      return {
        name,
        count,
        decision: decision?.decision ?? 'use',
        comment: decision?.comment ?? ''
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return { field, entries };
}

export function saveAssetTypeDecision(name, decision, comment) {
  const field = getAssetTypeField();
  if (!field) {
    throw createError('Asset type field is not configured. Set it in the Asset Pool overview first.');
  }

  const assetTypeName = normaliseName(name);
  if (!assetTypeName) {
    throw createError('Asset type value is required.');
  }

  const { counts } = collectAssetTypeCounts(field);
  if (!counts.has(assetTypeName)) {
    throw createError('Asset type value was not found in the Asset Pool.', 404);
  }

  const payload = {
    asset_type: assetTypeName,
    decision: normaliseDecision(decision),
    comment: typeof comment === 'string' ? comment.trim() : ''
  };

  const data = store.get(DECISIONS_TABLE);
  const existing = data.rows.find((row) => normaliseName(row?.asset_type) === assetTypeName);
  if (existing) {
    store.update(DECISIONS_TABLE, existing.id, {
      decision: payload.decision,
      comment: payload.comment
    });
  } else {
    store.insert(DECISIONS_TABLE, payload);
  }

  logger.info('Saved asset type decision', {
    assetType: assetTypeName,
    decision: payload.decision
  });

  return {
    name: assetTypeName,
    decision: payload.decision,
    comment: payload.comment
  };
}
