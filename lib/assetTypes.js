import { getAssetPoolView } from './assetPool.js';
import { getAssetSubCategoryLocation } from './assetStructure.js';
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

function normaliseLookupName(value) {
  const name = normaliseName(value);
  return name ? name.toLocaleLowerCase() : '';
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
    logger.info('Gespeicherte Asset-Typ-Entscheidungen werden gelöscht, da das Feld geändert wurde');
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

function collectAssetTypeGroupUsage() {
  const groupData = store.get('groups');
  const categoryData = store.get('group_categories');
  const assignmentData = store.get('group_asset_types');

  const groups = Array.isArray(groupData?.rows) ? groupData.rows : [];
  const groupCategories = Array.isArray(categoryData?.rows) ? categoryData.rows : [];
  const assignments = Array.isArray(assignmentData?.rows) ? assignmentData.rows : [];

  const groupLookup = new Map();
  groups.forEach((group) => {
    const id = Number(group?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return;
    }
    groupLookup.set(id, group);
  });

  const assetSubCategoryLookup = new Map();
  groupCategories.forEach((row) => {
    const groupId = Number(row?.group_id);
    const categoryId = Number(row?.category_id);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return;
    }
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return;
    }
    if (!assetSubCategoryLookup.has(groupId)) {
      assetSubCategoryLookup.set(groupId, categoryId);
    }
  });

  const usage = new Map();

  function registerUsage(name, groupId) {
    const key = normaliseLookupName(name);
    const id = Number(groupId);
    if (!key || !Number.isInteger(id) || id <= 0) {
      return;
    }

    const group = groupLookup.get(id);
    if (!group) {
      return;
    }

    const title = normaliseName(group?.title) || normaliseName(group?.name) || `Group ${group.id}`;
    const assetSubCategoryId = assetSubCategoryLookup.get(id) ?? null;
    let url = null;

    if (Number.isInteger(assetSubCategoryId) && assetSubCategoryId > 0) {
      const location = getAssetSubCategoryLocation(assetSubCategoryId);
      if (location?.topic?.id && location?.subTopic?.id) {
        url = `/asset-structure/${location.topic.id}/${location.subTopic.id}/${assetSubCategoryId}/groups/${group.id}`;
      }
    }

    const list = usage.get(key) ?? [];
    if (!list.some((entry) => entry.id === group.id)) {
      list.push({
        id: group.id,
        title,
        assetSubCategoryId,
        url
      });
      usage.set(key, list);
    }
  }

  assignments.forEach((row) => {
    registerUsage(row?.asset_type, row?.group_id);
  });

  groups.forEach((group) => {
    registerUsage(group?.asset_type, group?.id);
  });

  usage.forEach((list) => {
    list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
  });

  return usage;
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
      logger.info('Einstellung für Asset-Typ-Feld gelöscht');
    }
    return null;
  }

  if (currentField === nextField) {
    return currentField;
  }

  setSetting(SETTINGS_KEY, nextField);
  resetAssetTypeDecisions();
  logger.info('Einstellung für Asset-Typ-Feld aktualisiert', { field: nextField });
  return nextField;
}

export function getAssetTypeSummary() {
  const field = getAssetTypeField();
  if (!field) {
    return { field: null, entries: [] };
  }

  const { counts } = collectAssetTypeCounts(field);
  const decisions = getDecisionsMap();
  const usage = collectAssetTypeGroupUsage();

  const entries = Array.from(counts.entries())
    .map(([name, count]) => {
      const decision = decisions.get(name);
      const groups = usage.get(normaliseLookupName(name)) ?? [];
      const storedDecision = decision?.decision ?? 'use';
      const effectiveDecision = groups.length > 0 ? 'use' : storedDecision;
      return {
        name,
        count,
        decision: effectiveDecision,
        comment: decision?.comment ?? '',
        groups
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  return { field, entries };
}

export function saveAssetTypeDecision(name, decision, comment) {
  const field = getAssetTypeField();
  if (!field) {
    throw createError(
      'Asset-Typ-Feld ist nicht konfiguriert. Bitte legen Sie es zuerst in der Asset-Pool-Übersicht fest.'
    );
  }

  const assetTypeName = normaliseName(name);
  if (!assetTypeName) {
    throw createError('Asset-Typ-Wert ist erforderlich.');
  }

  const { counts } = collectAssetTypeCounts(field);
  if (!counts.has(assetTypeName)) {
    throw createError('Asset-Typ-Wert wurde im Asset-Pool nicht gefunden.', 404);
  }

  const usage = collectAssetTypeGroupUsage();

  const payload = {
    asset_type: assetTypeName,
    decision: normaliseDecision(decision),
    comment: typeof comment === 'string' ? comment.trim() : ''
  };

  if (payload.decision === 'ignore') {
    const key = normaliseLookupName(assetTypeName);
    const assignments = usage.get(key) ?? [];
    if (assignments.length > 0) {
      throw createError(
        'Dieser Asset-Typ kann nicht ignoriert werden, weil er einer oder mehreren Gruppen zugewiesen ist.',
        409
      );
    }
  }

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

  logger.info('Asset-Typ-Entscheidung gespeichert', {
    assetType: assetTypeName,
    decision: payload.decision
  });

  return {
    name: assetTypeName,
    decision: payload.decision,
    comment: payload.comment
  };
}
