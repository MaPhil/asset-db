import { store } from './storage.js';
import { logger } from './logger.js';
import { buildAssetStructure, normaliseText } from './assetStructure.js';

const CATEGORY_TABLE = 'asset_categories';
const ASSIGNMENT_TABLE = 'asset_category_assignments';

const FALLBACK_CATEGORY_NAME = 'Asset-Kategorie';

const normaliseName = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value).trim();
};

const normaliseDecision = (value) => (value === 'ignore' ? 'ignore' : 'use');

const normaliseComment = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const toPositiveInteger = (value) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
};

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getCategoryRows = () => {
  const table = store.get(CATEGORY_TABLE);
  return Array.isArray(table?.rows) ? table.rows : [];
};

const getAssignmentRows = () => {
  const table = store.get(ASSIGNMENT_TABLE);
  return Array.isArray(table?.rows) ? table.rows : [];
};

export const getIgnoredAssetSubCategoryIds = () => {
  const categories = getCategoryRows();
  const assignments = getAssignmentRows();

  const ignoredCategoryIds = new Set();
  categories.forEach((row) => {
    const id = toPositiveInteger(row?.id);
    if (!id) {
      return;
    }

    if (normaliseDecision(row?.decision) === 'ignore') {
      ignoredCategoryIds.add(id);
    }
  });

  const ignoredAssetSubCategoryIds = new Set();
  assignments.forEach((row) => {
    const categoryId = toPositiveInteger(row?.asset_category_id);
    const assetSubCategoryId = toPositiveInteger(row?.asset_sub_category_id);

    if (!categoryId || !assetSubCategoryId) {
      return;
    }

    if (ignoredCategoryIds.has(categoryId)) {
      ignoredAssetSubCategoryIds.add(assetSubCategoryId);
    }
  });

  return ignoredAssetSubCategoryIds;
};

const getCategoryName = (row) => {
  const name = normaliseName(row?.name);
  if (name) {
    return name;
  }
  const title = normaliseName(row?.title);
  if (title) {
    return title;
  }
  const id = toPositiveInteger(row?.id);
  return id ? `${FALLBACK_CATEGORY_NAME} ${id}` : FALLBACK_CATEGORY_NAME;
};

const buildAssetSubCategoryIndex = () => {
  const { topics, subTopicByAssetSubCategoryId } = buildAssetStructure();
  const map = new Map();

  topics.forEach((topic) => {
    const topicTitle = normaliseText(topic?.displayTitle || topic?.title) || '';
    const assetSubCategories = Array.isArray(topic?.assetSubCategories)
      ? topic.assetSubCategories
      : [];
    assetSubCategories.forEach((assetSubCategory) => {
      if (!map.has(assetSubCategory.id)) {
        const entry = {
          id: assetSubCategory.id,
          title: normaliseText(assetSubCategory?.title || assetSubCategory?.name) ||
            `AssetUnterKategorie ${assetSubCategory.id}`,
          topicTitle,
          subTopicTitle: ''
        };
        const location = subTopicByAssetSubCategoryId.get(assetSubCategory.id);
        if (location?.subTopic) {
          entry.subTopicTitle =
            normaliseText(location.subTopic.displayTitle || location.subTopic.title) || '';
        }
        map.set(assetSubCategory.id, entry);
      }
    });
  });

  return {
    list: Array.from(map.values()).sort((a, b) =>
      a.title.localeCompare(b.title, 'de', { sensitivity: 'base', numeric: true })
    ),
    byId: map
  };
};

export const getAssetCategoryOverview = () => {
  const categories = getCategoryRows();
  const assignments = getAssignmentRows();
  const assetSubCategoryIndex = buildAssetSubCategoryIndex();

  const assignmentsByCategory = new Map();
  const assignmentsByAssetSubCategory = new Map();

  assignments.forEach((row) => {
    const categoryId = toPositiveInteger(row?.asset_category_id);
    const assetSubCategoryId = toPositiveInteger(row?.asset_sub_category_id);
    if (!categoryId || !assetSubCategoryId) {
      return;
    }

    const list = assignmentsByCategory.get(categoryId) ?? [];
    if (!list.includes(assetSubCategoryId)) {
      list.push(assetSubCategoryId);
      assignmentsByCategory.set(categoryId, list);
    }
    if (!assignmentsByAssetSubCategory.has(assetSubCategoryId)) {
      assignmentsByAssetSubCategory.set(assetSubCategoryId, categoryId);
    }
  });

  const overviewCategories = categories
    .map((row) => {
      const id = toPositiveInteger(row?.id);
      if (!id) {
        return null;
      }
      const decision = normaliseDecision(row?.decision);
      const comment = normaliseComment(row?.comment);
      const assetSubCategoryIds = assignmentsByCategory.get(id) ?? [];
    const assetSubCategories = assetSubCategoryIds
      .map((assetSubCategoryId) => assetSubCategoryIndex.byId.get(assetSubCategoryId))
        .filter(Boolean)
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          topicTitle: entry.topicTitle,
          subTopicTitle: entry.subTopicTitle
        }));

      return {
        id,
        name: getCategoryName(row),
        decision,
        comment,
        assetSubCategoryCount: assetSubCategoryIds.length,
        assetSubCategories
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base', numeric: true }));

  const categoryNameById = new Map();
  overviewCategories.forEach((category) => {
    categoryNameById.set(category.id, category.name);
  });

  const overviewAssetSubCategories = assetSubCategoryIndex.list.map((entry) => {
    const assignedCategoryId = assignmentsByAssetSubCategory.get(entry.id) ?? null;
    return {
      id: entry.id,
      title: entry.title,
      topicTitle: entry.topicTitle,
      subTopicTitle: entry.subTopicTitle,
      assignedCategoryId,
      assignedCategoryName: assignedCategoryId ? categoryNameById.get(assignedCategoryId) || '' : ''
    };
  });

  return {
    categories: overviewCategories,
    assetSubCategories: overviewAssetSubCategories
  };
};

export const createAssetCategory = (inputName) => {
  const name = normaliseName(inputName);
  if (!name) {
    throw createError('Name der Asset-Kategorie wird benötigt.');
  }

  const payload = {
    name,
    decision: 'use',
    comment: ''
  };

  const id = store.insert(CATEGORY_TABLE, payload);
  logger.info('Asset-Kategorie erstellt', { id, name });
  return {
    id,
    name,
    decision: 'use',
    comment: '',
    assetSubCategoryCount: 0,
    assetSubCategories: []
  };
};

const removeAssignmentsForCategoryIds = (categoryId, assetSubCategoryIds) => {
  if (!assetSubCategoryIds.length) {
    return;
  }

  const assignments = getAssignmentRows();
  assignments.forEach((row) => {
    const assignmentId = toPositiveInteger(row?.id);
    const assignedCategoryId = toPositiveInteger(row?.asset_category_id);
    const assetSubCategoryId = toPositiveInteger(row?.asset_sub_category_id);

    if (!assignmentId || !assignedCategoryId || !assetSubCategoryId) {
      return;
    }

    if (
      assetSubCategoryIds.includes(assetSubCategoryId) &&
      assignedCategoryId !== categoryId
    ) {
      store.remove(ASSIGNMENT_TABLE, assignmentId);
    }
  });
};

const syncCategoryAssignments = (categoryId, assetSubCategoryIds) => {
  const assignments = getAssignmentRows();
  const existing = assignments.filter((row) => toPositiveInteger(row?.asset_category_id) === categoryId);
  const existingIds = new Set(existing.map((row) => toPositiveInteger(row?.asset_sub_category_id)).filter(Boolean));

  const nextIds = assetSubCategoryIds.filter((value, index, array) => array.indexOf(value) === index);

  existing.forEach((row) => {
    const assignmentId = toPositiveInteger(row?.id);
    const assetSubCategoryId = toPositiveInteger(row?.asset_sub_category_id);
    if (!assignmentId || !assetSubCategoryId) {
      return;
    }
    if (!nextIds.includes(assetSubCategoryId)) {
      store.remove(ASSIGNMENT_TABLE, assignmentId);
    }
  });

  nextIds.forEach((assetSubCategoryId) => {
    if (existingIds.has(assetSubCategoryId)) {
      return;
    }
    store.insert(ASSIGNMENT_TABLE, {
      asset_category_id: categoryId,
      asset_sub_category_id: assetSubCategoryId
    });
  });
};

export const updateAssetCategory = (categoryId, { decision, comment, assetSubCategoryIds }) => {
  const id = toPositiveInteger(categoryId);
  if (!id) {
    throw createError('Ungültige Asset-Kategorie.', 404);
  }

  const rows = getCategoryRows();
  const current = rows.find((row) => toPositiveInteger(row?.id) === id);
  if (!current) {
    throw createError('Asset-Kategorie nicht gefunden.', 404);
  }

  const patch = {};
  if (decision !== undefined) {
    patch.decision = normaliseDecision(decision);
  }
  if (comment !== undefined) {
    patch.comment = normaliseComment(comment);
  }

  if (Object.keys(patch).length) {
    store.update(CATEGORY_TABLE, id, patch);
  }

  if (Array.isArray(assetSubCategoryIds)) {
    const assetSubCategoryIndex = buildAssetSubCategoryIndex();
    const validIds = new Set(assetSubCategoryIndex.list.map((entry) => entry.id));
    const filteredIds = assetSubCategoryIds
      .map((value) => toPositiveInteger(value))
      .filter((value) => value && validIds.has(value));

    removeAssignmentsForCategoryIds(id, filteredIds);
    syncCategoryAssignments(id, filteredIds);
  }

  logger.info('Asset-Kategorie aktualisiert', { id });
  return getAssetCategoryOverview();
};

export const deleteAssetCategory = (categoryId) => {
  const id = toPositiveInteger(categoryId);
  if (!id) {
    throw createError('Ungültige Asset-Kategorie.', 404);
  }

  const rows = getCategoryRows();
  const exists = rows.some((row) => toPositiveInteger(row?.id) === id);
  if (!exists) {
    throw createError('Asset-Kategorie nicht gefunden.', 404);
  }

  const assignments = getAssignmentRows();
  assignments.forEach((row) => {
    const assignmentId = toPositiveInteger(row?.id);
    const assignedCategoryId = toPositiveInteger(row?.asset_category_id);
    if (assignmentId && assignedCategoryId === id) {
      store.remove(ASSIGNMENT_TABLE, assignmentId);
    }
  });

  store.remove(CATEGORY_TABLE, id);
  logger.info('Asset-Kategorie gelöscht', { id });

  return getAssetCategoryOverview();
};
