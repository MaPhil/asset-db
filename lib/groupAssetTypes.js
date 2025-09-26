import { getAssetTypeSummary } from './assetTypes.js';
import { logger } from './logger.js';
import { store } from './storage.js';

function normaliseName(value) {
  if (value === undefined || value === null) {
    return '';
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed.toLowerCase() : '';
}

function canonicalName(value) {
  if (value === undefined || value === null) {
    return '';
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed : '';
}

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireGroup(groupId) {
  const id = Number(groupId);
  if (!Number.isInteger(id) || id <= 0) {
    throw createError('Invalid group identifier.', 400);
  }

  const groups = store.get('groups').rows;
  const group = groups.find((row) => row.id === id);
  if (!group) {
    throw createError('Group not found.', 404);
  }
  return group;
}

function collectAssignedNameSets() {
  const map = new Map();

  const rows = store.get('group_asset_types').rows;
  rows.forEach((row) => {
    const groupId = Number(row?.group_id);
    const name = canonicalName(row?.asset_type);
    const normalised = normaliseName(name);
    if (!Number.isInteger(groupId) || groupId <= 0 || !normalised) {
      return;
    }
    if (!map.has(groupId)) {
      map.set(groupId, new Set());
    }
    map.get(groupId).add(normalised);
  });

  const groups = store.get('groups').rows;
  groups.forEach((group) => {
    const groupId = Number(group?.id);
    const name = canonicalName(group?.asset_type);
    const normalised = normaliseName(name);
    if (!Number.isInteger(groupId) || groupId <= 0 || !normalised) {
      return;
    }
    if (!map.has(groupId)) {
      map.set(groupId, new Set());
    }
    map.get(groupId).add(normalised);
  });

  return map;
}

export function listGroupAssetTypes(groupId) {
  const group = requireGroup(groupId);
  const id = Number(groupId);
  const summary = getAssetTypeSummary();
  const summaryMap = new Map();
  summary.entries.forEach((entry) => {
    const normalised = normaliseName(entry?.name);
    if (normalised) {
      summaryMap.set(normalised, {
        count: entry?.count ?? 0,
        decision: entry?.decision ?? null
      });
    }
  });

  const items = [];
  const seen = new Set();

  function addItem(name, meta = {}) {
    const canonical = canonicalName(name);
    const normalised = normaliseName(name);
    if (!canonical || !normalised || seen.has(normalised)) {
      return;
    }

    const summaryEntry = summaryMap.get(normalised);
    items.push({
      id: meta.id ?? null,
      name: canonical,
      count: summaryEntry?.count ?? 0,
      decision: summaryEntry?.decision ?? null,
      isLegacy: Boolean(meta.isLegacy),
      createdAt: meta.createdAt ?? null
    });
    seen.add(normalised);
  }

  const rows = store.get('group_asset_types').rows;
  rows
    .filter((row) => Number(row?.group_id) === id)
    .forEach((row) => {
      addItem(row?.asset_type, {
        id: row?.id ?? null,
        createdAt: row?.created_at ?? row?.updated_at ?? null
      });
    });

  addItem(group?.asset_type, {
    isLegacy: true,
    createdAt: group?.updated_at || group?.created_at || null
  });

  return items.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
}

export function getAvailableAssetTypesForGroup(groupId) {
  requireGroup(groupId);
  const id = Number(groupId);

  const assignments = collectAssignedNameSets();
  const currentAssignments = assignments.get(id) ?? new Set();
  const reservedByOthers = new Set();
  assignments.forEach((names, groupKey) => {
    if (groupKey !== id) {
      names.forEach((name) => reservedByOthers.add(name));
    }
  });

  const summary = getAssetTypeSummary();
  return summary.entries
    .filter((entry) => {
      const normalised = normaliseName(entry?.name);
      if (!normalised) {
        return false;
      }
      if (entry?.decision === 'ignore') {
        return false;
      }
      if (reservedByOthers.has(normalised)) {
        return false;
      }
      if (currentAssignments.has(normalised)) {
        return false;
      }
      return true;
    })
    .map((entry) => ({
      name: entry.name,
      count: entry.count ?? 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export function addAssetTypeToGroup(groupId, name) {
  const group = requireGroup(groupId);
  const id = Number(groupId);
  const candidate = canonicalName(name);
  const normalised = normaliseName(candidate);
  if (!normalised) {
    throw createError('Asset type name is required.');
  }

  const available = getAvailableAssetTypesForGroup(id);
  const match = available.find((entry) => normaliseName(entry.name) === normalised);
  if (!match) {
    throw createError('Asset type is not available for this group.', 409);
  }

  const timestamp = new Date().toISOString();
  const rowId = store.insert('group_asset_types', {
    group_id: id,
    asset_type: match.name,
    created_at: timestamp,
    updated_at: timestamp
  });

  logger.info('Asset type assigned to group', {
    groupId: id,
    assetType: match.name,
    groupTitle: group?.title || group?.name || `Group ${group?.id}`
  });

  return {
    id: rowId,
    name: match.name,
    count: match.count ?? 0,
    createdAt: timestamp
  };
}
