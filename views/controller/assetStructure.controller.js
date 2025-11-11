import { store } from '../../lib/storage.js';
import { logger } from '../../lib/logger.js';
import { getAssetTypeSummary } from '../../lib/assetTypes.js';
import {
  getAssetCategoryOverview,
  getIgnoredAssetSubCategoryIds
} from '../../lib/assetCategories.js';
import { getGroupAssetSelectorOverview } from '../../lib/groupAssetSelectors.js';
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

const collectOwners = (assetSubCategories) => {
  const owners = new Set();

  assetSubCategories.forEach((assetSubCategory) => {
    const owner =
      normaliseText(assetSubCategory?.owner) || normaliseText(assetSubCategory?.group_owner);
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

const normaliseMeasureFilterValue = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) {
      return '';
    }
    return String(value);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) {
      return '';
    }
    const num = Number(text);
    if (Number.isInteger(num) && num > 0) {
      return String(num);
    }
    return text;
  }

  return '';
};

const buildMeasuresUrl = ({ topicId, subTopicId, assetSubCategoryId }) => {
  const params = new URLSearchParams();
  const topicValue = normaliseMeasureFilterValue(topicId);
  const subTopicValue = normaliseMeasureFilterValue(subTopicId);
  const assetSubCategoryValue = normaliseMeasureFilterValue(assetSubCategoryId);

  if (topicValue) {
    params.set('topic', topicValue);
  }
  if (subTopicValue) {
    params.set('subTopic', subTopicValue);
  }
  if (assetSubCategoryValue) {
    params.set('category', assetSubCategoryValue);
  }

  if (!params.size) {
    return null;
  }

  return `/measures?${params.toString()}`;
};

export const renderAssetStructure = (req, res) => {
  const { topics } = buildAssetStructure();
  const ignoredAssetSubCategoryIds = getIgnoredAssetSubCategoryIds();
  const groupCounts = buildGroupCounts();

  const topicRows = topics.map((topic) => {
    const topicMeasureId = topic?.measure?.id;
    const measuresUrl = buildMeasuresUrl({ topicId: topicMeasureId });
    const assetSubCategoryCount = topic.subTopics.reduce((sum, subTopic) => {
      const visibleSubCategories = subTopic.assetSubCategories.filter(
        (assetSubCategory) => !ignoredAssetSubCategoryIds.has(assetSubCategory.id)
      );
      return sum + visibleSubCategories.length;
    }, 0);

    const groupCount = topic.subTopics.reduce((sum, subTopic) => {
      return (
        sum +
        subTopic.assetSubCategories.reduce(
          (categorySum, assetSubCategory) =>
            ignoredAssetSubCategoryIds.has(assetSubCategory.id)
              ? categorySum
              : categorySum + (groupCounts.get(assetSubCategory.id) ?? 0),
          0
        )
      );
    }, 0);

    return {
      id: topic.id,
      title: topic.displayTitle,
      subTopicCount: topic.subTopics.length,
      assetSubCategoryCount,
      groupCount,
      owner: collectOwners(
        topic.assetSubCategories.filter(
          (assetSubCategory) => !ignoredAssetSubCategoryIds.has(assetSubCategory.id)
        )
      ),
      measuresUrl
    };
  });

  res.render('asset-structure', {
    nav: 'assetStructure',
    topics: topicRows,
    topicCount: topicRows.length
  });
};

export const renderAssetCategories = (req, res) => {
  const overview = getAssetCategoryOverview();

  res.render('asset-categories', {
    nav: 'assetStructure',
    categories: overview.categories,
    assetCategoryState: overview,
    categoryCount: overview.categories.length,
    assetSubCategoryCount: overview.assetSubCategories.length
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
  const ignoredAssetSubCategoryIds = getIgnoredAssetSubCategoryIds();

  const subTopics = topic.subTopics.map((subTopic) => {
    const assetSubCategoryCount = subTopic.assetSubCategories.filter(
      (assetSubCategory) => !ignoredAssetSubCategoryIds.has(assetSubCategory.id)
    ).length;
    const groupCount = subTopic.assetSubCategories.reduce(
      (sum, assetSubCategory) =>
        ignoredAssetSubCategoryIds.has(assetSubCategory.id)
          ? sum
          : sum + (groupCounts.get(assetSubCategory.id) ?? 0),
      0
    );
    const measuresUrl = buildMeasuresUrl({
      topicId: topic?.measure?.id,
      subTopicId: subTopic?.measure?.id
    });

    return {
      id: subTopic.id,
      title: subTopic.displayTitle,
      topicId: topic.id,
      assetSubCategoryCount,
      groupCount,
      owner: collectOwners(
        subTopic.assetSubCategories.filter(
          (assetSubCategory) => !ignoredAssetSubCategoryIds.has(assetSubCategory.id)
        )
      ),
      measuresUrl,
      measure: subTopic.measure
    };
  });

  res.render('asset-structure-topic', {
    nav: 'assetStructure',
    topic: {
      id: topic.id,
      title: topic.displayTitle,
      displayTitle: topic.displayTitle || TOPIC_FALLBACK_TITLE,
      measuresUrl: buildMeasuresUrl({ topicId: topic?.measure?.id }),
      measure: topic.measure
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
  const ignoredAssetSubCategoryIds = getIgnoredAssetSubCategoryIds();

  const assetSubCategories = subTopic.assetSubCategories.map((assetSubCategory) => {
    const isIgnored = ignoredAssetSubCategoryIds.has(assetSubCategory.id);

    return {
      id: assetSubCategory.id,
      title:
        assetSubCategory.title || assetSubCategory.name || `AssetUnterKategorie ${assetSubCategory.id}`,
      owner:
        normaliseText(assetSubCategory.owner) || normaliseText(assetSubCategory.group_owner) || '—',
      integrity: normaliseText(assetSubCategory.integrity) || '—',
      availability: normaliseText(assetSubCategory.availability) || '—',
      confidentiality: normaliseText(assetSubCategory.confidentiality) || '—',
      groupCount: groupCounts.get(assetSubCategory.id) ?? 0,
      measuresUrl: buildMeasuresUrl({
        topicId: topic?.measure?.id,
        subTopicId: subTopic?.measure?.id,
        assetSubCategoryId: assetSubCategory?.measure?.id
      }),
      isIgnored
    };
  });

  const visibleAssetSubCategoryCount = assetSubCategories.filter((entry) => !entry.isIgnored).length;

  res.render('asset-structure-sub-topic', {
    nav: 'assetStructure',
    topic: {
      id: topic.id,
      title: topic.displayTitle,
      displayTitle: topic.displayTitle || TOPIC_FALLBACK_TITLE,
      measuresUrl: buildMeasuresUrl({ topicId: topic?.measure?.id }),
      measure: topic.measure
    },
    subTopic: {
      id: subTopic.id,
      title: subTopic.displayTitle,
      displayTitle: subTopic.displayTitle || SUB_TOPIC_FALLBACK_TITLE,
      measuresUrl: buildMeasuresUrl({
        topicId: topic?.measure?.id,
        subTopicId: subTopic?.measure?.id
      }),
      measure: subTopic.measure
    },
    notes: '',
    assetSubCategories,
    assetSubCategoryCount: visibleAssetSubCategoryCount
  });
};

export const renderAssetStructureAssetSubCategory = (req, res) => {
  const { topicId, subTopicId } = req.params;
  const assetSubCategoryId = Number(req.params.assetSubCategoryId);

  if (!Number.isInteger(assetSubCategoryId) || assetSubCategoryId <= 0) {
    logger.warn('Ungültige AssetUnterKategorie-ID angefordert', {
      assetSubCategoryId,
      topicId,
      subTopicId
    });
    return res.status(404).send('AssetUnterKategorie nicht gefunden');
  }

  const { topicById, subTopicById } = buildAssetStructure();
  const topic = topicById.get(topicId);

  if (!topic) {
    logger.warn('Themengebiet für AssetUnterKategorie nicht gefunden', {
      topicId,
      assetSubCategoryId
    });
    return res.status(404).send('Themengebiet nicht gefunden');
  }

  const key = getSubTopicKey(topicId, subTopicId);
  const subTopic = subTopicById.get(key);

  if (!subTopic) {
    logger.warn('Sub-Themengebiet für AssetUnterKategorie nicht gefunden', {
      topicId,
      subTopicId,
      assetSubCategoryId
    });
    return res.status(404).send('Sub-Themengebiet nicht gefunden');
  }

  const assetSubCategory = subTopic.assetSubCategories.find((entry) => entry.id === assetSubCategoryId);

  if (!assetSubCategory) {
    logger.warn('AssetUnterKategorie für UI-Route nicht gefunden', {
      assetSubCategoryId,
      topicId,
      subTopicId
    });
    return res.status(404).send('AssetUnterKategorie nicht gefunden');
  }

  const links = store
    .get('group_categories')
    .rows.filter((row) => Number(row.category_id) === assetSubCategoryId);
  const groups = store
    .get('groups')
    .rows.filter((group) => links.some((link) => Number(link.group_id) === group.id));

  const viewModel = {
    id: assetSubCategory.id,
    title: assetSubCategory.title || assetSubCategory.name || '',
    displayTitle: assetSubCategory.title || assetSubCategory.name || 'Unbenannte AssetUnterKategorie',
    description: assetSubCategory.description || '',
    owner: assetSubCategory.owner || assetSubCategory.group_owner || '',
    integrity: assetSubCategory.integrity || '',
    availability: assetSubCategory.availability || '',
    confidentiality: assetSubCategory.confidentiality || '',
    measuresUrl: buildMeasuresUrl({
      topicId: topic?.measure?.id,
      subTopicId: subTopic?.measure?.id,
      assetSubCategoryId: assetSubCategory?.measure?.id
    })
  };

  const groupRows = groups.map((group) => ({
    id: group.id,
    title: group.title || `Gruppe ${group.id}`,
    status: group.status || '—',
    assetType: group.asset_type || '—',
    updatedAt: formatDateTime(group.updated_at) || '—'
  }));

  res.render('asset-structure-asset-sub-category', {
    nav: 'assetStructure',
    topic: {
      id: topic.id,
      title: topic.displayTitle,
      displayTitle: topic.displayTitle || TOPIC_FALLBACK_TITLE,
      measuresUrl: buildMeasuresUrl({ topicId: topic?.measure?.id })
    },
    subTopic: {
      id: subTopic.id,
      title: subTopic.displayTitle,
      displayTitle: subTopic.displayTitle || SUB_TOPIC_FALLBACK_TITLE,
      measuresUrl: buildMeasuresUrl({
        topicId: topic?.measure?.id,
        subTopicId: subTopic?.measure?.id
      })
    },
    assetSubCategory: viewModel,
    groups: groupRows,
    groupCount: groupRows.length
  });
};

export const renderAssetStructureGroup = (req, res) => {
  const assetSubCategoryId = Number(req.params.assetSubCategoryId);
  const groupId = Number(req.params.groupId);
  const { topicId, subTopicId } = req.params;

  if (!Number.isInteger(assetSubCategoryId) || assetSubCategoryId <= 0) {
    logger.warn('Ungültige AssetUnterKategorie-ID für Gruppen-UI-Route', {
      assetSubCategoryId,
      groupId,
      topicId,
      subTopicId
    });
    return res.status(404).send('AssetUnterKategorie nicht gefunden');
  }

  const { topicById, subTopicById } = buildAssetStructure();
  const topic = topicById.get(topicId);

  if (!topic) {
    logger.warn('Themengebiet für Gruppen-UI-Route nicht gefunden', {
      topicId,
      assetSubCategoryId,
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
      assetSubCategoryId,
      groupId
    });
    return res.status(404).send('Sub-Themengebiet nicht gefunden');
  }

  const assetSubCategory = subTopic.assetSubCategories.find((entry) => entry.id === assetSubCategoryId);

  if (!assetSubCategory) {
    logger.warn('AssetUnterKategorie für Gruppen-UI-Route nicht gefunden', {
      topicId,
      subTopicId,
      assetSubCategoryId,
      groupId
    });
    return res.status(404).send('AssetUnterKategorie nicht gefunden');
  }

  const assetSubCategoryOptions = store
    .get('categories')
    .rows.map((row) => ({
      id: row.id,
      title: row.title || row.name || `AssetUnterKategorie ${row.id}`
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));

  const group = store
    .get('groups')
    .rows.find((row) => row.id === groupId);

  if (!group) {
    logger.warn('Gruppe für UI-Route nicht gefunden', { assetSubCategoryId, groupId });
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

  const selectorOverview = getGroupAssetSelectorOverview(group.id);

  res.render('asset-structure-group', {
    nav: 'assetStructure',
    topic: {
      id: topic.id,
      title: topic.displayTitle,
      displayTitle: topic.displayTitle || TOPIC_FALLBACK_TITLE,
      measuresUrl: buildMeasuresUrl({ topicId: topic?.measure?.id })
    },
    subTopic: {
      id: subTopic.id,
      title: subTopic.displayTitle,
      displayTitle: subTopic.displayTitle || SUB_TOPIC_FALLBACK_TITLE,
      measuresUrl: buildMeasuresUrl({
        topicId: topic?.measure?.id,
        subTopicId: subTopic?.measure?.id
      })
    },
    assetSubCategory: {
      id: assetSubCategory.id,
      title: assetSubCategory.title || assetSubCategory.name || 'Unbenannte AssetUnterKategorie',
      measuresUrl: buildMeasuresUrl({
        topicId: topic?.measure?.id,
        subTopicId: subTopic?.measure?.id,
        assetSubCategoryId: assetSubCategory?.measure?.id
      })
    },
    group: detail,
    assetSubCategoryOptions,
    groupSelectorState: selectorOverview,
    groupSelectorCount: selectorOverview?.selectors?.length ?? 0
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
