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

const loadMeasureData = () => {
  const stateTable = store.get('measure_state');
  const stateRow = Array.isArray(stateTable?.rows) ? stateTable.rows[0] : null;
  const versionId = Number(stateRow?.current_version_id);

  if (!Number.isInteger(versionId) || versionId <= 0) {
    return {
      versionId: null,
      topics: [],
      subTopics: [],
      categories: [],
      measures: []
    };
  }

  const collectRows = (tableName) => {
    const table = store.get(tableName);
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    return rows.filter((row) => Number(row?.version_id) === versionId);
  };

  const topics = collectRows('measure_topics');
  const subTopics = collectRows('measure_sub_topics');
  const categories = collectRows('measure_categories');
  const measures = collectRows('measures');

  return {
    versionId,
    topics,
    subTopics,
    categories,
    measures
  };
};

const parseIds = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const result = [];
  value.forEach((entry) => {
    const id = Number(entry);
    if (Number.isInteger(id) && id > 0 && !result.includes(id)) {
      result.push(id);
    }
  });
  return result;
};

export const buildAssetStructure = () => {
  const measureData = loadMeasureData();

  if (!measureData.versionId) {
    return {
      topics: [],
      topicById: new Map(),
      subTopicById: new Map(),
      topicByAssetSubCategoryId: new Map(),
      subTopicByAssetSubCategoryId: new Map()
    };
  }

  const topicMap = new Map();
  measureData.topics.forEach((row) => {
    const id = Number(row?.id);
    if (Number.isInteger(id) && id > 0) {
      topicMap.set(id, row);
    }
  });

  const subTopicMap = new Map();
  measureData.subTopics.forEach((row) => {
    const id = Number(row?.id);
    if (Number.isInteger(id) && id > 0) {
      subTopicMap.set(id, row);
    }
  });

  const measureCategoryMap = new Map();
  measureData.categories.forEach((row) => {
    const id = Number(row?.id);
    if (Number.isInteger(id) && id > 0) {
      measureCategoryMap.set(id, row);
    }
  });

  const TOPIC_FALLBACK_KEY = '__fallback__';

  const topics = [];
  const topicsByMeasureId = new Map();
  const usedTopicSlugs = new Set();
  const measureSubTopicInstances = new Map();
  const fallbackAssetSubCategoriesByTopicKey = new Map();
  const topicToSubTopicIds = new Map();
  const subTopicToAssetSubCategoryIds = new Map();

  const addAssetSubCategoryToList = (list, assetSubCategory) => {
    if (!assetSubCategory) {
      return;
    }
    if (!list.some((entry) => entry.id === assetSubCategory.id)) {
      list.push(assetSubCategory);
    }
  };

  const assetSubCategoryCache = new Map();
  const ensureAssetSubCategory = (assetSubCategoryId) => {
    if (!Number.isInteger(assetSubCategoryId) || assetSubCategoryId <= 0) {
      return null;
    }

    if (assetSubCategoryCache.has(assetSubCategoryId)) {
      return assetSubCategoryCache.get(assetSubCategoryId);
    }

    const row = measureCategoryMap.get(assetSubCategoryId) ?? null;
    const title = normaliseText(row?.title) || `AssetUnterKategorie ${assetSubCategoryId}`;
    const entry = {
      id: assetSubCategoryId,
      title,
      name: title,
      owner: normaliseText(row?.owner) || '',
      group_owner: normaliseText(row?.group_owner) || '',
      integrity: normaliseText(row?.integrity) || '',
      availability: normaliseText(row?.availability) || '',
      confidentiality: normaliseText(row?.confidentiality) || '',
      description: normaliseText(row?.description) || '',
      measure: createMeasureReference(row)
    };

    assetSubCategoryCache.set(assetSubCategoryId, entry);
    return entry;
  };

  const createTopic = (row, { measureIdOverride = null, fallbackTitle = FALLBACK_TOPIC_TITLE } = {}) => {
    const title = normaliseText(row?.title) || fallbackTitle || FALLBACK_TOPIC_TITLE;
    const slug = ensureUniqueSlug(
      usedTopicSlugs,
      slugify(title),
      `themengebiet-${topics.length + 1}`
    );

    const topic = {
      id: slug,
      title,
      displayTitle: title,
      subTopics: [],
      assetSubCategories: [],
      measure: null,
      _subTopicsByMeasureId: new Map(),
      _fallbackSubTopics: new Map(),
      _usedSubTopicSlugs: new Set()
    };

    if (row) {
      topic.measure = createMeasureReference(row);
    }

    const resolvedMeasureId = Number.isInteger(measureIdOverride) && measureIdOverride > 0
      ? measureIdOverride
      : Number(row?.id);

    if (Number.isInteger(resolvedMeasureId) && resolvedMeasureId > 0) {
      topicsByMeasureId.set(resolvedMeasureId, topic);
      if (!topic.measure) {
        topic.measure = { id: resolvedMeasureId, title };
      }
    }

    topics.push(topic);
    return topic;
  };

  measureData.topics.forEach((row) => {
    createTopic(row);
  });

  let fallbackTopic = null;
  const ensureFallbackTopic = () => {
    if (fallbackTopic) {
      return fallbackTopic;
    }

    fallbackTopic = createTopic(null, { fallbackTitle: FALLBACK_TOPIC_TITLE });
    fallbackTopic.measure = null;
    fallbackTopic.title = FALLBACK_TOPIC_TITLE;
    fallbackTopic.displayTitle = FALLBACK_TOPIC_TITLE;
    return fallbackTopic;
  };

  const ensureTopicByKey = (topicKey) => {
    if (topicKey === TOPIC_FALLBACK_KEY) {
      return ensureFallbackTopic();
    }

    const topicId = Number(topicKey);
    if (Number.isInteger(topicId) && topicId > 0) {
      const existing = topicsByMeasureId.get(topicId);
      if (existing) {
        return existing;
      }

      const row = topicMap.get(topicId) ?? null;
      return createTopic(row, { measureIdOverride: topicId });
    }

    return ensureFallbackTopic();
  };

  const ensureSubTopic = (topic, { measureRow = null, fallbackKey = null, fallbackTitle = null } = {}) => {
    const measureId = Number(measureRow?.id);
    let subTopic = null;

    if (Number.isInteger(measureId) && measureId > 0) {
      subTopic = topic._subTopicsByMeasureId.get(measureId) ?? null;
    }

    if (!subTopic && fallbackKey) {
      subTopic = topic._fallbackSubTopics.get(fallbackKey) ?? null;
    }

    if (!subTopic) {
      const title =
        normaliseText(measureRow?.title) ||
        normaliseText(fallbackTitle) ||
        FALLBACK_SUB_TOPIC_TITLE;

      const slug = ensureUniqueSlug(
        topic._usedSubTopicSlugs,
        slugify(title),
        `sub-${topic.subTopics.length + 1}`
      );

      subTopic = {
        id: slug,
        title,
        displayTitle: title,
        topicId: topic.id,
        assetSubCategories: [],
        measure: null,
        _topicRef: topic
      };

      if (measureRow) {
        subTopic.measure = createMeasureReference(measureRow);
      }

      topic.subTopics.push(subTopic);

      if (Number.isInteger(measureId) && measureId > 0) {
        topic._subTopicsByMeasureId.set(measureId, subTopic);
      } else if (fallbackKey) {
        topic._fallbackSubTopics.set(fallbackKey, subTopic);
      }
    }

    if (Number.isInteger(measureId) && measureId > 0) {
      const title = normaliseText(measureRow?.title);
      if (title) {
        subTopic.title = title;
        subTopic.displayTitle = title;
      }

      if (!subTopic.measure) {
        subTopic.measure = createMeasureReference(measureRow) || { id: measureId, title: title || '' };
      }

      const list = measureSubTopicInstances.get(measureId) ?? [];
      if (!list.includes(subTopic)) {
        list.push(subTopic);
        measureSubTopicInstances.set(measureId, list);
      }
    }

    return subTopic;
  };

  measureData.measures.forEach((measure) => {
    const topicIds = parseIds(measure?.topic_ids);
    const subTopicIds = parseIds(measure?.sub_topic_ids);
    const categoryIds = parseIds(measure?.category_ids);

    const topicKeys = topicIds.length
      ? topicIds.map((id) => String(id))
      : [TOPIC_FALLBACK_KEY];

    topicKeys.forEach((topicKey) => {
      if (subTopicIds.length) {
        const subTopicSet = topicToSubTopicIds.get(topicKey) ?? new Set();
        subTopicIds.forEach((subTopicId) => {
          subTopicSet.add(subTopicId);
        });
        topicToSubTopicIds.set(topicKey, subTopicSet);
      }

      if (!subTopicIds.length && categoryIds.length) {
        const fallbackSet = fallbackAssetSubCategoriesByTopicKey.get(topicKey) ?? new Set();
        categoryIds.forEach((categoryId) => fallbackSet.add(categoryId));
        fallbackAssetSubCategoriesByTopicKey.set(topicKey, fallbackSet);
      }
    });

    subTopicIds.forEach((subTopicId) => {
      const assetSubCategorySet = subTopicToAssetSubCategoryIds.get(subTopicId) ?? new Set();
      categoryIds.forEach((categoryId) => assetSubCategorySet.add(categoryId));
      subTopicToAssetSubCategoryIds.set(subTopicId, assetSubCategorySet);
    });

    if (!subTopicIds.length && categoryIds.length && !topicIds.length) {
      const fallbackSet = fallbackAssetSubCategoriesByTopicKey.get(TOPIC_FALLBACK_KEY) ?? new Set();
      categoryIds.forEach((categoryId) => fallbackSet.add(categoryId));
      fallbackAssetSubCategoriesByTopicKey.set(TOPIC_FALLBACK_KEY, fallbackSet);
    }
  });

  topicToSubTopicIds.forEach((subTopicIds, topicKey) => {
    const topic = ensureTopicByKey(topicKey);

    subTopicIds.forEach((subTopicId) => {
      const row = subTopicMap.get(subTopicId) ?? null;
      ensureSubTopic(topic, {
        measureRow: row,
        fallbackKey: `measure-${subTopicId}`
      });
    });
  });

  measureData.subTopics.forEach((row) => {
    const id = Number(row?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return;
    }

    if (!measureSubTopicInstances.has(id)) {
      const topic = ensureFallbackTopic();
      ensureSubTopic(topic, {
        measureRow: row,
        fallbackKey: `measure-${id}`
      });
    }
  });

  subTopicToAssetSubCategoryIds.forEach((categoryIds, subTopicId) => {
    let instances = measureSubTopicInstances.get(subTopicId);

    if (!instances || !instances.length) {
      const row = subTopicMap.get(subTopicId) ?? null;
      const topic = ensureFallbackTopic();
      const subTopic = ensureSubTopic(topic, {
        measureRow: row,
        fallbackKey: `measure-${subTopicId}`
      });
      instances = [subTopic];
      measureSubTopicInstances.set(subTopicId, instances);
    }

    instances.forEach((subTopic) => {
      categoryIds.forEach((categoryId) => {
        const assetSubCategory = ensureAssetSubCategory(categoryId);
        addAssetSubCategoryToList(subTopic.assetSubCategories, assetSubCategory);
        addAssetSubCategoryToList(subTopic._topicRef.assetSubCategories, assetSubCategory);
      });
    });
  });

  fallbackAssetSubCategoriesByTopicKey.forEach((categoryIds, topicKey) => {
    const topic = ensureTopicByKey(topicKey);
    const subTopic = ensureSubTopic(topic, {
      fallbackKey: 'fallback',
      fallbackTitle: FALLBACK_SUB_TOPIC_TITLE
    });

    categoryIds.forEach((categoryId) => {
      const assetSubCategory = ensureAssetSubCategory(categoryId);
      addAssetSubCategoryToList(subTopic.assetSubCategories, assetSubCategory);
      addAssetSubCategoryToList(topic.assetSubCategories, assetSubCategory);
    });
  });

  const sortByTitle = (a, b) => {
    const titleA = normaliseText(a?.title || a?.name || '');
    const titleB = normaliseText(b?.title || b?.name || '');
    return titleA.localeCompare(titleB, 'de', { sensitivity: 'base' });
  };

  const filteredTopics = topics.filter(
    (topic) => topic.subTopics.length || topic.assetSubCategories.length || topic.measure
  );

  filteredTopics.forEach((topic) => {
    topic.subTopics.forEach((subTopic) => {
      subTopic.assetSubCategories.sort(sortByTitle);
      delete subTopic._topicRef;
    });

    topic.subTopics.sort((a, b) => sortByTitle(a, b));
    topic.assetSubCategories.sort(sortByTitle);
    delete topic._subTopicsByMeasureId;
    delete topic._fallbackSubTopics;
    delete topic._usedSubTopicSlugs;
  });

  filteredTopics.sort((a, b) => sortByTitle(a, b));

  const topicById = new Map();
  const subTopicById = new Map();
  const topicByAssetSubCategoryId = new Map();
  const subTopicByAssetSubCategoryId = new Map();

  filteredTopics.forEach((topic) => {
    topicById.set(topic.id, topic);

    topic.subTopics.forEach((subTopic) => {
      subTopicById.set(createSubTopicKey(topic.id, subTopic.id), subTopic);

      subTopic.assetSubCategories.forEach((assetSubCategory) => {
        if (!topicByAssetSubCategoryId.has(assetSubCategory.id)) {
          topicByAssetSubCategoryId.set(assetSubCategory.id, topic);
        }
        if (!subTopicByAssetSubCategoryId.has(assetSubCategory.id)) {
          subTopicByAssetSubCategoryId.set(assetSubCategory.id, { topic, subTopic });
        }
      });
    });
  });

  return {
    topics: filteredTopics,
    topicById,
    subTopicById,
    topicByAssetSubCategoryId,
    subTopicByAssetSubCategoryId
  };
};

export const getAssetSubCategoryLocation = (assetSubCategoryId) => {
  const { subTopicByAssetSubCategoryId } = buildAssetStructure();
  return subTopicByAssetSubCategoryId.get(assetSubCategoryId) ?? null;
};

export const getSubTopicKey = createSubTopicKey;
export const TOPIC_FALLBACK_TITLE = FALLBACK_TOPIC_TITLE;
export const SUB_TOPIC_FALLBACK_TITLE = FALLBACK_SUB_TOPIC_TITLE;
export { normaliseText };
