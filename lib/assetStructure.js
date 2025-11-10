import { store } from './storage.js';

const FALLBACK_TOPIC_TITLE = 'Allgemein';
const FALLBACK_SUB_TOPIC_TITLE = 'Allgemein';

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

const ensureUniqueSlug = (usedSlugs, base, fallback) => {
  const normalisedBase = base || '';
  const fallbackBase = fallback || 'slug';
  let attempt = 0;
  let candidate = normalisedBase || fallbackBase;

  while (usedSlugs.has(candidate)) {
    attempt += 1;
    candidate = `${normalisedBase || fallbackBase}-${attempt + 1}`;
  }

  usedSlugs.add(candidate);
  return candidate;
};

const resolveTopicTitle = (category) => {
  const candidates = [
    normaliseText(category?.thematic_area),
    normaliseText(category?.topic),
    normaliseText(category?.governing_category)
  ];

  const title = candidates.find((candidate) => candidate.length > 0);
  return title || FALLBACK_TOPIC_TITLE;
};

const resolveSubTopicTitle = (category) => {
  const candidates = [
    normaliseText(category?.topic),
    normaliseText(category?.subcategory),
    normaliseText(category?.sub_topic)
  ];

  const title = candidates.find((candidate) => candidate.length > 0);
  return title || FALLBACK_SUB_TOPIC_TITLE;
};

const resolveCategoryTitle = (category) => {
  const candidates = [
    normaliseText(category?.title),
    normaliseText(category?.name),
    normaliseText(category?.category),
    normaliseText(category?.asset_category)
  ];
  const title = candidates.find((candidate) => candidate.length > 0);
  return title || '';
};

const createSubTopicKey = (topicId, subTopicId) => `${topicId}::${subTopicId}`;

const createMeasureReference = (entry) => {
  if (!entry) {
    return null;
  }

  const id = Number(entry.id);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return {
    id,
    title: normaliseText(entry.title) || ''
  };
};

const loadMeasureReferences = () => {
  const stateTable = store.get('measure_state');
  const stateRow = Array.isArray(stateTable?.rows) ? stateTable.rows[0] : null;
  const versionId = Number(stateRow?.current_version_id);

  if (!Number.isInteger(versionId) || versionId <= 0) {
    return {
      versionId: null,
      topics: new Map(),
      subTopics: new Map(),
      categories: new Map()
    };
  }

  const collectRows = (tableName) => {
    const table = store.get(tableName);
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    return rows.filter((row) => Number(row?.version_id) === versionId);
  };

  const topics = new Map();
  const subTopics = new Map();
  const categories = new Map();

  const capture = (map, title, row) => {
    const key = normaliseText(title).toLocaleLowerCase('de-DE');
    if (!key) {
      return;
    }
    if (!map.has(key)) {
      map.set(key, row);
    }
  };

  collectRows('measure_topics').forEach((row) => {
    capture(topics, row?.title, row);
  });

  collectRows('measure_sub_topics').forEach((row) => {
    capture(subTopics, row?.title, row);
  });

  collectRows('measure_categories').forEach((row) => {
    capture(categories, row?.title, row);
  });

  return { versionId, topics, subTopics, categories };
};

export const buildAssetStructure = () => {
  const categoryData = store.get('categories');
  const categories = Array.isArray(categoryData?.rows) ? categoryData.rows : [];

  const measureReferences = loadMeasureReferences();

  const topicsByKey = new Map();
  const usedTopicSlugs = new Set();

  categories.forEach((category) => {
    const topicTitle = resolveTopicTitle(category);
    const topicKey = topicTitle.toLocaleLowerCase('de-DE');
    let topic = topicsByKey.get(topicKey);

    if (!topic) {
      const topicSlug = ensureUniqueSlug(
        usedTopicSlugs,
        slugify(topicTitle),
        `themengebiet-${topicsByKey.size + 1}`
      );

      topic = {
        id: topicSlug,
        title: topicTitle,
        displayTitle: topicTitle || FALLBACK_TOPIC_TITLE,
        subTopics: [],
        categories: [],
        measure: null,
        _subTopicsByKey: new Map(),
        _usedSubTopicSlugs: new Set()
      };

      topicsByKey.set(topicKey, topic);
    }

    if (!topic.measure) {
      const measureTopic = measureReferences.topics.get(topicKey);
      topic.measure = createMeasureReference(measureTopic);
    }

    const subTopicTitle = resolveSubTopicTitle(category);
    const subTopicKey = subTopicTitle.toLocaleLowerCase('de-DE');
    let subTopic = topic._subTopicsByKey.get(subTopicKey);

    if (!subTopic) {
      const subTopicSlug = ensureUniqueSlug(
        topic._usedSubTopicSlugs,
        slugify(subTopicTitle),
        `sub-${topic._subTopicsByKey.size + 1}`
      );

      subTopic = {
        id: subTopicSlug,
        title: subTopicTitle,
        displayTitle: subTopicTitle || FALLBACK_SUB_TOPIC_TITLE,
        topicId: topic.id,
        categories: [],
        measure: null
      };

      topic._subTopicsByKey.set(subTopicKey, subTopic);
      topic.subTopics.push(subTopic);
    }

    if (!subTopic.measure) {
      const measureSubTopic = measureReferences.subTopics.get(subTopicKey);
      subTopic.measure = createMeasureReference(measureSubTopic);
    }

    const categoryTitle = resolveCategoryTitle(category);
    const categoryKey = categoryTitle.toLocaleLowerCase('de-DE');
    const measureCategory = measureReferences.categories.get(categoryKey);
    const categoryEntry = {
      ...category,
      measure: createMeasureReference(measureCategory)
    };

    topic.categories.push(categoryEntry);
    subTopic.categories.push(categoryEntry);
  });

  const topics = Array.from(topicsByKey.values()).map((topic) => {
    topic.subTopics.forEach((subTopic) => {
      subTopic.categories.sort((a, b) => {
        const titleA = normaliseText(a?.title || a?.name || '');
        const titleB = normaliseText(b?.title || b?.name || '');
        return titleA.localeCompare(titleB, 'de', { sensitivity: 'base' });
      });
    });

    topic.subTopics.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));
    topic.categories.sort((a, b) => {
      const titleA = normaliseText(a?.title || a?.name || '');
      const titleB = normaliseText(b?.title || b?.name || '');
      return titleA.localeCompare(titleB, 'de', { sensitivity: 'base' });
    });
    delete topic._subTopicsByKey;
    delete topic._usedSubTopicSlugs;
    return topic;
  });

  topics.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));

  const topicById = new Map();
  const subTopicById = new Map();
  const topicByCategoryId = new Map();
  const subTopicByCategoryId = new Map();

  topics.forEach((topic) => {
    topicById.set(topic.id, topic);

    topic.subTopics.forEach((subTopic) => {
      const key = createSubTopicKey(topic.id, subTopic.id);
      subTopicById.set(key, subTopic);

      subTopic.categories.forEach((category) => {
        topicByCategoryId.set(category.id, topic);
        subTopicByCategoryId.set(category.id, { topic, subTopic });
      });
    });
  });

  return {
    topics,
    topicById,
    subTopicById,
    topicByCategoryId,
    subTopicByCategoryId
  };
};

export const getCategoryLocation = (categoryId) => {
  const { subTopicByCategoryId } = buildAssetStructure();
  return subTopicByCategoryId.get(categoryId) ?? null;
};

export const getSubTopicKey = createSubTopicKey;
export const TOPIC_FALLBACK_TITLE = FALLBACK_TOPIC_TITLE;
export const SUB_TOPIC_FALLBACK_TITLE = FALLBACK_SUB_TOPIC_TITLE;
export { normaliseText };
