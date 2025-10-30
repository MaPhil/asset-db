import { store } from '../../lib/storage.js';
import { logger } from '../../lib/logger.js';
import { getAssetTypeSummary } from '../../lib/assetTypes.js';
import {
  getAvailableAssetTypesForGroup,
  listGroupAssetTypes
} from '../../lib/groupAssetTypes.js';

const FALLBACK_TOPIC_TITLE = 'Allgemein';

const normaliseText = (value) => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value == null) {
    return '';
  }

  return String(value).trim();
};

const slugify = (value) =>
  value
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const resolveTopicTitle = (category) => {
  const candidates = [
    normaliseText(category.thematic_area),
    normaliseText(category.topic),
    normaliseText(category.governing_category)
  ];

  const title = candidates.find((candidate) => candidate.length > 0);

  return title || FALLBACK_TOPIC_TITLE;
};

const buildTopicHierarchy = () => {
  const categories = store.get('categories').rows;
  const usedSlugs = new Set();
  const topicsByTitle = new Map();

  const ensureUniqueSlug = (title, fallbackSuffix) => {
    const base = slugify(title) || `themengebiet-${fallbackSuffix}`;
    let slug = base;
    let attempt = 1;

    while (usedSlugs.has(slug)) {
      attempt += 1;
      slug = `${base}-${attempt}`;
    }

    usedSlugs.add(slug);
    return slug;
  };

  categories.forEach((category) => {
    const topicTitle = resolveTopicTitle(category);
    let topic = topicsByTitle.get(topicTitle);

    if (!topic) {
      const slug = ensureUniqueSlug(topicTitle, topicsByTitle.size + 1);
      topic = { id: slug, title: topicTitle, categories: [] };
      topicsByTitle.set(topicTitle, topic);
    }

    topic.categories.push(category);
  });

  const topics = Array.from(topicsByTitle.values()).sort((a, b) =>
    a.title.localeCompare(b.title, 'de', { sensitivity: 'base' })
  );

  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const topicByCategoryId = new Map();

  topics.forEach((topic) => {
    topic.categories.forEach((category) => {
      topicByCategoryId.set(category.id, topic);
    });
  });

  return { topics, topicById, topicByCategoryId };
};

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

export const renderAssetStructure = (req, res) => {
  const { topics } = buildTopicHierarchy();
  const links = store.get('group_categories').rows;

  const groupCounts = links.reduce((map, link) => {
    const current = map.get(link.category_id) ?? 0;
    map.set(link.category_id, current + 1);
    return map;
  }, new Map());

  const topicRows = topics.map((topic) => {
    const owners = new Set(
      topic.categories
        .map((category) => category.owner || category.group_owner)
        .filter(Boolean)
    );

    const ownerDisplay =
      owners.size === 0
        ? '—'
        : owners.size === 1
        ? [...owners][0]
        : `${owners.size} Verantwortliche`;

    const assetCategoryCount = topic.categories.reduce(
      (sum, category) => sum + (groupCounts.get(category.id) ?? 0),
      0
    );

    return {
      id: topic.id,
      title: topic.title,
      subTopicCount: topic.categories.length,
      assetCategoryCount,
      owner: ownerDisplay
    };
  });

  res.render('asset-structure', {
    nav: 'assetStructure',
    topics: topicRows,
    topicCount: topicRows.length
  });
};

export const renderAssetStructureSubTopic = (req, res) => {
  const topicId = req.params.topicId;
  const { topics, topicById } = buildTopicHierarchy();
  const topic = topicById.get(topicId);

  if (!topic) {
    logger.warn('Themengebiet für UI-Route nicht gefunden', { topicId });
    return res.status(404).send('Themengebiet nicht gefunden');
  }

  const links = store.get('group_categories').rows;
  const groupCounts = links.reduce((map, link) => {
    const current = map.get(link.category_id) ?? 0;
    map.set(link.category_id, current + 1);
    return map;
  }, new Map());

  const subTopics = topic.categories
    .map((category) => ({
      id: category.id,
      title:
        category.title || category.name || `Sub-Themengebiet ${category.id}`,
      owner: category.owner || category.group_owner || '—',
      assetCategoryCount: groupCounts.get(category.id) ?? 0,
      integrity: category.integrity || '—',
      availability: category.availability || '—',
      confidentiality: category.confidentiality || '—'
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));

  res.render('asset-structure-sub-topic', {
    nav: 'assetStructure',
    topic: {
      id: topic.id,
      title: topic.title,
      displayTitle: topic.title || FALLBACK_TOPIC_TITLE
    },
    subTopics,
    subTopicCount: subTopics.length
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

export const renderAssetStructureAssetCategory = (req, res) => {
  const categoryId = Number(req.params.id);
  const categories = store.get('categories').rows;
  const category = categories.find((row) => row.id === categoryId);

  if (!category) {
    logger.warn('Asset-Kategorie für UI-Route nicht gefunden', { categoryId });
    return res.status(404).send('Asset-Kategorie nicht gefunden');
  }

  const { topicByCategoryId } = buildTopicHierarchy();
  const topic = topicByCategoryId.get(category.id);

  const links = store
    .get('group_categories')
    .rows.filter((row) => row.category_id === categoryId);
  const groups = store
    .get('groups')
    .rows.filter((group) => links.some((link) => link.group_id === group.id));

  const viewModel = {
    id: category.id,
    title: category.title || category.name || '',
    displayTitle:
      category.title || category.name || 'Unbenannte Asset Kategorie',
    description: category.description || '',
    governingCategory: category.governing_category || '',
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
    topic: topic
      ? {
          id: topic.id,
          title: topic.title,
          displayTitle: topic.title || FALLBACK_TOPIC_TITLE
        }
      : null,
    assetCategory: viewModel,
    groups: groupRows,
    groupCount: groupRows.length
  });
};

export const renderAssetStructureGroup = (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const groupId = Number(req.params.groupId);

  const categories = store.get('categories').rows;
  const category = categories.find((row) => row.id === categoryId);

  if (!category) {
    logger.warn('Kategorie für Gruppen-UI-Route nicht gefunden', { categoryId, groupId });
    return res.status(404).send('Kategorie nicht gefunden');
  }

  const { topicByCategoryId } = buildTopicHierarchy();
  const topic = topicByCategoryId.get(category.id);

  const categoryOptions = categories
    .map((row) => ({
      id: row.id,
      title: row.title || row.name || `Kategorie ${row.id}`
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

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
    category: {
      id: category.id,
      title: category.title || category.name || 'Unbenannte Asset Kategorie'
    },
    topic: topic
      ? {
          id: topic.id,
          title: topic.title,
          displayTitle: topic.title || FALLBACK_TOPIC_TITLE
        }
      : null,
    group: detail,
    categoryOptions,
    groupAssetTypes,
    availableGroupAssetTypesCount: availableGroupAssetTypes.length,
    groupAssetTypeCount: groupAssetTypes.length
  });
};
