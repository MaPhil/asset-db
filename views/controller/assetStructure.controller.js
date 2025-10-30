import { store } from '../../lib/storage.js';
import { logger } from '../../lib/logger.js';
import { getAssetTypeSummary } from '../../lib/assetTypes.js';
import {
  getAvailableAssetTypesForGroup,
  listGroupAssetTypes
} from '../../lib/groupAssetTypes.js';
import {
  buildAssetStructure,
  getSubTopicKey,
  normaliseText,
  SUB_TOPIC_FALLBACK_TITLE,
  TOPIC_FALLBACK_TITLE
} from '../../lib/assetStructure.js';

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch (err) {
    logger.warn('Datumsformatierung fehlgeschlagen', { value, err });
    return null;
  }
};

const buildGroupCounts = () => {
  const links = store.get('group_categories');
  const rows = Array.isArray(links?.rows) ? links.rows : [];

  return rows.reduce((map, link) => {
    const categoryId = Number(link?.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return map;
    }

    const current = map.get(categoryId) ?? 0;
    map.set(categoryId, current + 1);
    return map;
  }, new Map());
};

const collectOwners = (categories) => {
  const owners = new Set();

  categories.forEach((category) => {
    const owner = normaliseText(category?.owner) || normaliseText(category?.group_owner);
    if (owner) {
      owners.add(owner);
    }
  });

  if (owners.size === 0) {
    return '—';
  }

  if (owners.size === 1) {
    return owners.values().next().value;
  }

  return `${owners.size} Verantwortliche`;
};

export const renderAssetStructure = (req, res) => {
  const { topics } = buildAssetStructure();
  const groupCounts = buildGroupCounts();

  const topicRows = topics.map((topic) => {
    const assetCategoryCount = topic.subTopics.reduce(
      (sum, subTopic) => sum + subTopic.categories.length,
      0
    );

    const groupCount = topic.subTopics.reduce((sum, subTopic) => {
      return (
        sum +
        subTopic.categories.reduce(
          (categorySum, category) => categorySum + (groupCounts.get(category.id) ?? 0),
          0
        )
      );
    }, 0);

    return {
      id: topic.id,
      title: topic.displayTitle,
      subTopicCount: topic.subTopics.length,
      assetCategoryCount,
      groupCount,
      owner: collectOwners(topic.categories)
    };
  });

  res.render('asset-structure', {
    nav: 'assetStructure',
    topics: topicRows,
    topicCount: topicRows.length
  });
};

export const renderAssetStructureTopic = (req, res) => {
  const { topicId } = req.params;
  const { topicById } = buildAssetStructure();
  const topic = topicById.get(topicId);

  if (!topic) {
    logger.warn('Themengebiet für UI-Route nicht gefunden', { topicId });
    return res.status(404).send('Themengebiet nicht gefunden');
  }

  const groupCounts = buildGroupCounts();

  const subTopics = topic.subTopics.map((subTopic) => {
    const assetCategoryCount = subTopic.categories.length;
    const groupCount = subTopic.categories.reduce(
      (sum, category) => sum + (groupCounts.get(category.id) ?? 0),
      0
    );

    return {
      id: subTopic.id,
      title: subTopic.displayTitle,
      topicId: topic.id,
      assetCategoryCount,
      groupCount,
      owner: collectOwners(subTopic.categories)
    };
  });

  res.render('asset-structure-topic', {
    nav: 'assetStructure',
    topic: {
      id: topic.id,
      title: topic.displayTitle,
      displayTitle: topic.displayTitle || TOPIC_FALLBACK_TITLE
    },
    notes: '',
    subTopics,
    subTopicCount: subTopics.length
  });
};

export const renderAssetStructureSubTopic = (req, res) => {
  const { topicId, subTopicId } = req.params;
  const { topicById, subTopicById } = buildAssetStructure();
  const topic = topicById.get(topicId);

  if (!topic) {
    logger.warn('Themengebiet für UI-Route nicht gefunden', { topicId, subTopicId });
    return res.status(404).send('Themengebiet nicht gefunden');
  }

  const key = getSubTopicKey(topicId, subTopicId);
  const subTopic = subTopicById.get(key);

  if (!subTopic) {
    logger.warn('Sub-Themengebiet für UI-Route nicht gefunden', { topicId, subTopicId });
    return res.status(404).send('Sub-Themengebiet nicht gefunden');
  }

  const groupCounts = buildGroupCounts();

  const assetCategories = subTopic.categories.map((category) => ({
    id: category.id,
    title: category.title || category.name || `Asset Kategorie ${category.id}`,
    owner: normaliseText(category.owner) || normaliseText(category.group_owner) || '—',
    integrity: normaliseText(category.integrity) || '—',
    availability: normaliseText(category.availability) || '—',
    confidentiality: normaliseText(category.confidentiality) || '—',
    groupCount: groupCounts.get(category.id) ?? 0
  }));

  res.render('asset-structure-sub-topic', {
    nav: 'assetStructure',
    topic: {
      id: topic.id,
      title: topic.displayTitle,
      displayTitle: topic.displayTitle || TOPIC_FALLBACK_TITLE
    },
    subTopic: {
      id: subTopic.id,
      title: subTopic.displayTitle,
      displayTitle: subTopic.displayTitle || SUB_TOPIC_FALLBACK_TITLE
    },
    notes: '',
    assetCategories,
    assetCategoryCount: assetCategories.length
  });
};

export const renderAssetStructureAssetCategory = (req, res) => {
  const { topicId, subTopicId } = req.params;
  const categoryId = Number(req.params.categoryId);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    logger.warn('Ungültige Asset-Kategorie-ID angefordert', { categoryId, topicId, subTopicId });
    return res.status(404).send('Asset-Kategorie nicht gefunden');
  }

  const { topicById, subTopicById } = buildAssetStructure();
  const topic = topicById.get(topicId);

  if (!topic) {
    logger.warn('Themengebiet für Asset-Kategorie nicht gefunden', { topicId, categoryId });
    return res.status(404).send('Themengebiet nicht gefunden');
  }

  const key = getSubTopicKey(topicId, subTopicId);
  const subTopic = subTopicById.get(key);

  if (!subTopic) {
    logger.warn('Sub-Themengebiet für Asset-Kategorie nicht gefunden', {
      topicId,
      subTopicId,
      categoryId
    });
    return res.status(404).send('Sub-Themengebiet nicht gefunden');
  }

  const category = subTopic.categories.find((entry) => entry.id === categoryId);

  if (!category) {
    logger.warn('Asset-Kategorie für UI-Route nicht gefunden', { categoryId, topicId, subTopicId });
    return res.status(404).send('Asset-Kategorie nicht gefunden');
  }

  const links = store
    .get('group_categories')
    .rows.filter((row) => Number(row.category_id) === categoryId);
  const groups = store
    .get('groups')
    .rows.filter((group) => links.some((link) => Number(link.group_id) === group.id));

  const viewModel = {
    id: category.id,
    title: category.title || category.name || '',
    displayTitle: category.title || category.name || 'Unbenannte Asset Kategorie',
    description: category.description || '',
    owner: category.owner || category.group_owner || '',
    integrity: category.integrity || '',
    availability: category.availability || '',
    confidentiality: category.confidentiality || ''
  };

  const groupRows = groups.map((group) => ({
    id: group.id,
    title: group.title || `Gruppe ${group.id}`,
    status: group.status || '—',
    assetType: group.asset_type || '—',
    updatedAt: formatDateTime(group.updated_at) || '—'
  }));

  res.render('asset-structure-asset-category', {
    nav: 'assetStructure',
    topic: {
      id: topic.id,
      title: topic.displayTitle,
      displayTitle: topic.displayTitle || TOPIC_FALLBACK_TITLE
    },
    subTopic: {
      id: subTopic.id,
      title: subTopic.displayTitle,
      displayTitle: subTopic.displayTitle || SUB_TOPIC_FALLBACK_TITLE
    },
    assetCategory: viewModel,
    groups: groupRows,
    groupCount: groupRows.length
  });
};

export const renderAssetStructureGroup = (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const groupId = Number(req.params.groupId);
  const { topicId, subTopicId } = req.params;

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    logger.warn('Ungültige Kategorie-ID für Gruppen-UI-Route', {
      categoryId,
      groupId,
      topicId,
      subTopicId
    });
    return res.status(404).send('Kategorie nicht gefunden');
  }

  const { topicById, subTopicById } = buildAssetStructure();
  const topic = topicById.get(topicId);

  if (!topic) {
    logger.warn('Themengebiet für Gruppen-UI-Route nicht gefunden', {
      topicId,
      categoryId,
      groupId
    });
    return res.status(404).send('Themengebiet nicht gefunden');
  }

  const key = getSubTopicKey(topicId, subTopicId);
  const subTopic = subTopicById.get(key);

  if (!subTopic) {
    logger.warn('Sub-Themengebiet für Gruppen-UI-Route nicht gefunden', {
      topicId,
      subTopicId,
      categoryId,
      groupId
    });
    return res.status(404).send('Sub-Themengebiet nicht gefunden');
  }

  const category = subTopic.categories.find((entry) => entry.id === categoryId);

  if (!category) {
    logger.warn('Kategorie für Gruppen-UI-Route nicht gefunden', {
      topicId,
      subTopicId,
      categoryId,
      groupId
    });
    return res.status(404).send('Kategorie nicht gefunden');
  }

  const categoryOptions = store
    .get('categories')
    .rows.map((row) => ({
      id: row.id,
      title: row.title || row.name || `Kategorie ${row.id}`
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));

  const group = store
    .get('groups')
    .rows.find((row) => row.id === groupId);

  if (!group) {
    logger.warn('Gruppe für UI-Route nicht gefunden', { categoryId, groupId });
    return res.status(404).send('Gruppe nicht gefunden');
  }

  const detail = {
    id: group.id,
    title: group.title || '',
    displayTitle: group.title || 'Unbenannte Gruppe',
    description: group.description || '',
    status: group.status || '',
    assetType: group.asset_type || '',
    createdAt: formatDateTime(group.created_at) || '—',
    updatedAt: formatDateTime(group.updated_at) || '—'
  };

  const groupAssetTypes = listGroupAssetTypes(group.id);
  const availableGroupAssetTypes = getAvailableAssetTypesForGroup(group.id);

  res.render('asset-structure-group', {
    nav: 'assetStructure',
    topic: {
      id: topic.id,
      title: topic.displayTitle,
      displayTitle: topic.displayTitle || TOPIC_FALLBACK_TITLE
    },
    subTopic: {
      id: subTopic.id,
      title: subTopic.displayTitle,
      displayTitle: subTopic.displayTitle || SUB_TOPIC_FALLBACK_TITLE
    },
    category: {
      id: category.id,
      title: category.title || category.name || 'Unbenannte Asset Kategorie'
    },
    group: detail,
    categoryOptions,
    groupAssetTypes,
    availableGroupAssetTypesCount: availableGroupAssetTypes.length,
    groupAssetTypeCount: groupAssetTypes.length
  });
};

export const renderAssetTypes = (req, res) => {
  const summary = getAssetTypeSummary();

  res.render('asset-types', {
    nav: 'assetStructure',
    assetTypes: summary.entries,
    assetTypeField: summary.field
  });
};
