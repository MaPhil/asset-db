import { ASSET_SUB_CATEGORIES_FILE, readJsonFile, store } from '../../lib/storage.js';
import { logger } from '../../lib/logger.js';
import { getIgnoredAssetSubCategoryIds } from '../../lib/assetCategories.js';
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

const getGroupCategoryIds = (group) => {
  const raw = Array.isArray(group?.category_ids)
    ? group.category_ids
    : group?.category_id
      ? [group.category_id]
      : [];

  return raw
    .map((value) => Number(value))
    .filter((value, index, array) => Number.isInteger(value) && value > 0 && array.indexOf(value) === index);
};

const getGroupsByCategoryId = (categoryId) => {
  const groups = store.get('groups');
  const rows = Array.isArray(groups?.rows) ? groups.rows : [];

  return rows.filter((group) => getGroupCategoryIds(group).includes(categoryId));
};

const buildGroupCounts = () => {
  const groups = store.get('groups');
  const rows = Array.isArray(groups?.rows) ? groups.rows : [];

  return rows.reduce((map, group) => {
    getGroupCategoryIds(group).forEach((categoryId) => {
      const current = map.get(categoryId) ?? 0;
      map.set(categoryId, current + 1);
    });
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

const loadAssetSubCategoriesBySubTopicTitle = (subTopicTitle) => {
  const payload = readJsonFile(ASSET_SUB_CATEGORIES_FILE, null);
  const data = payload?.data;

  if (!data || typeof data !== 'object' || !Object.keys(data).length) {
    return [];
  }

  const normalisedTargetTitle = normaliseText(subTopicTitle);

  return Object.values(data)
    .map((row) => row || {})
    .filter((row) => {
      const id = Number(row?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return false;
      }

      const links = Array.isArray(row.links) ? row.links : [];
      if (!links.length) {
        return false;
      }

      return links.some((link) => normaliseText(link?.subTopicTitle) === normalisedTargetTitle);
    })
    .map((row) => {
      const id = Number(row?.id);
      const measureId = Number(row?.measure?.id);
      const measureTitle = normaliseText(row?.measure?.title);

      return {
        id,
        title: normaliseText(row?.title || row?.name) || `AssetUnterKategorie ${id}`,
        owner: normaliseText(row?.owner) || normaliseText(row?.group_owner) || '—',
        integrity: normaliseText(row?.integrity) || '—',
        availability: normaliseText(row?.availability) || '—',
        confidentiality: normaliseText(row?.confidentiality) || '—',
        measure:
          Number.isInteger(measureId) && measureId > 0
            ? { id: measureId, title: measureTitle || '' }
            : null
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base', numeric: true }));
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

  const targetSubTopicTitle = subTopic.displayTitle || subTopic.title || SUB_TOPIC_FALLBACK_TITLE;

  const assetSubCategories = loadAssetSubCategoriesBySubTopicTitle(targetSubTopicTitle).map(
    (assetSubCategory) => {
      const isIgnored = ignoredAssetSubCategoryIds.has(assetSubCategory.id);

      return {
        id: assetSubCategory.id,
        title:
          assetSubCategory.title || assetSubCategory.name || `AssetUnterKategorie ${assetSubCategory.id}`,
        owner:
          normaliseText(assetSubCategory.owner) ||
          normaliseText(assetSubCategory.group_owner) ||
          '—',
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
    }
  );

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

  const groups = getGroupsByCategoryId(assetSubCategoryId);

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
