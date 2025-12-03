import { MEASURES_FILE, readJsonFile } from './storage.js';

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

const parseSemicolonList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normaliseText(entry))
      .map((entry) => entry.replace(/^;+|;+$/g, ''))
      .filter(Boolean);
  }

  if (value === undefined || value === null) {
    return [];
  }

  return String(value)
    .split(';')
    .map((entry) => normaliseText(entry))
    .map((entry) => entry.replace(/^;+|;+$/g, ''))
    .filter(Boolean);
};

const parseAssetSubCategories = (value) => {
  const entries = parseSemicolonList(value);
  const result = [];

  entries.forEach((entry) => {
    let id = Number(entry);
    if (!Number.isInteger(id) || id <= 0) {
      const match = String(entry).match(/\d+/);
      id = Number(match?.[0]);
    }

    if (Number.isInteger(id) && id > 0 && !result.some((item) => item.id === id)) {
      result.push({ id, title: entry });
    }
  });

  return result;
};

const loadMeasureRows = () => {
  const payload = readJsonFile(MEASURES_FILE, null);
  const data = payload?.data;

  if (!data || typeof data !== 'object' || !Object.keys(data).length) {
    return [];
  }

  return Object.values(data).map((row) => row || {});
};

export const buildAssetStructure = () => {
  const measureRows = loadMeasureRows();

  if (!measureRows.length) {
    return {
      topics: [],
      topicById: new Map(),
      subTopicById: new Map(),
      topicByAssetSubCategoryId: new Map(),
      subTopicByAssetSubCategoryId: new Map()
    };
  }

  const TOPIC_FALLBACK_KEY = '__fallback__';

  const topics = [];
  const usedTopicSlugs = new Set();
  const subTopicNamesByTopicKey = new Map();
  const subTopicCategoriesByTopicKey = new Map();
  const fallbackAssetSubCategoriesByTopicKey = new Map();
  const topicTitleByKey = new Map();
  const assetSubCategoryTitles = new Map();

  const addSubTopicName = (topicKey, name) => {
    const list = subTopicNamesByTopicKey.get(topicKey) ?? new Set();
    list.add(name);
    subTopicNamesByTopicKey.set(topicKey, list);
  };

  const addCategoriesForSubTopic = (topicKey, subTopicName, categories) => {
    if (!categories.length) {
      return;
    }

    const subTopicMap = subTopicCategoriesByTopicKey.get(topicKey) ?? new Map();
    const categorySet = subTopicMap.get(subTopicName) ?? new Set();
    categories.forEach((category) => categorySet.add(category.id));
    subTopicMap.set(subTopicName, categorySet);
    subTopicCategoriesByTopicKey.set(topicKey, subTopicMap);
  };

  const recordAssetSubCategoryTitles = (categories) => {
    categories.forEach((category) => {
      if (!assetSubCategoryTitles.has(category.id)) {
        const title = normaliseText(category.title) || `AssetUnterKategorie ${category.id}`;
        assetSubCategoryTitles.set(category.id, title);
      }
    });
  };

  measureRows.forEach((row) => {
    const topicTitles = parseSemicolonList(row?.Themengebiet);
    const subTopicTitles = parseSemicolonList(row?.['Sub-Themengebiet']);
    const categories = parseAssetSubCategories(row?.AssetUnterKategorien);

    const topicKeys = topicTitles.length ? topicTitles : [TOPIC_FALLBACK_KEY];
    topicKeys.forEach((topicKey) => {
      const topicTitle = topicKey === TOPIC_FALLBACK_KEY ? FALLBACK_TOPIC_TITLE : topicKey;
      topicTitleByKey.set(topicKey, topicTitle);

      if (subTopicTitles.length) {
        subTopicTitles.forEach((rawTitle) => {
          const subTopicTitle = rawTitle || FALLBACK_SUB_TOPIC_TITLE;
          addSubTopicName(topicKey, subTopicTitle);
          addCategoriesForSubTopic(topicKey, subTopicTitle, categories);
        });
      } else if (categories.length) {
        const fallbackSet = fallbackAssetSubCategoriesByTopicKey.get(topicKey) ?? new Set();
        categories.forEach((category) => fallbackSet.add(category.id));
        fallbackAssetSubCategoriesByTopicKey.set(topicKey, fallbackSet);
      }
    });

    recordAssetSubCategoryTitles(categories);
  });

  const sortByTitle = (a, b) => {
    const titleA = normaliseText(a?.title || a || '');
    const titleB = normaliseText(b?.title || b || '');
    return titleA.localeCompare(titleB, 'de', { sensitivity: 'base' });
  };

  const createTopic = (title) => {
    const resolvedTitle = normaliseText(title) || FALLBACK_TOPIC_TITLE;
    const slug = ensureUniqueSlug(
      usedTopicSlugs,
      slugify(resolvedTitle),
      `themengebiet-${topics.length + 1}`
    );

    const topic = {
      id: slug,
      title: resolvedTitle,
      displayTitle: resolvedTitle,
      subTopics: [],
      assetSubCategories: [],
      measure: null,
      _subTopicCache: new Map(),
      _usedSubTopicSlugs: new Set()
    };

    topics.push(topic);
    return topic;
  };

  const topicByKey = new Map();
  const sortedTopicKeys = Array.from(topicTitleByKey.entries()).sort(([, titleA], [, titleB]) =>
    normaliseText(titleA).localeCompare(normaliseText(titleB), 'de', { sensitivity: 'base' })
  );

  sortedTopicKeys.forEach(([topicKey, title]) => {
    topicByKey.set(topicKey, createTopic(title));
  });

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

    const title = assetSubCategoryTitles.get(assetSubCategoryId) || `AssetUnterKategorie ${assetSubCategoryId}`;
    const entry = {
      id: assetSubCategoryId,
      title,
      name: title,
      owner: '',
      group_owner: '',
      integrity: '',
      availability: '',
      confidentiality: '',
      description: '',
      measure: { id: assetSubCategoryId, title }
    };

    assetSubCategoryCache.set(assetSubCategoryId, entry);
    return entry;
  };

  const ensureSubTopic = (topic, title) => {
    const resolvedTitle = normaliseText(title) || FALLBACK_SUB_TOPIC_TITLE;
    const cache = topic._subTopicCache;

    if (cache.has(resolvedTitle)) {
      return cache.get(resolvedTitle);
    }

    const slug = ensureUniqueSlug(
      topic._usedSubTopicSlugs,
      slugify(resolvedTitle),
      `sub-${topic.subTopics.length + 1}`
    );

    const subTopic = {
      id: slug,
      title: resolvedTitle,
      displayTitle: resolvedTitle,
      topicId: topic.id,
      assetSubCategories: [],
      measure: null,
      _topicRef: topic
    };

    cache.set(resolvedTitle, subTopic);
    topic.subTopics.push(subTopic);
    return subTopic;
  };

  topicByKey.forEach((topic, topicKey) => {
    const subTopicNames = Array.from(subTopicNamesByTopicKey.get(topicKey) ?? []);
    subTopicNames
      .sort((a, b) => normaliseText(a).localeCompare(normaliseText(b), 'de', { sensitivity: 'base' }))
      .forEach((subTopicName) => {
        const subTopic = ensureSubTopic(topic, subTopicName);
        const categoryIds = Array.from(
          subTopicCategoriesByTopicKey.get(topicKey)?.get(subTopicName) ?? []
        );

        categoryIds.forEach((categoryId) => {
          const assetSubCategory = ensureAssetSubCategory(categoryId);
          addAssetSubCategoryToList(subTopic.assetSubCategories, assetSubCategory);
          addAssetSubCategoryToList(topic.assetSubCategories, assetSubCategory);
        });
      });
  });

  fallbackAssetSubCategoriesByTopicKey.forEach((categoryIds, topicKey) => {
    const topic = topicByKey.get(topicKey);
    const subTopic = ensureSubTopic(topic, FALLBACK_SUB_TOPIC_TITLE);

    categoryIds.forEach((categoryId) => {
      const assetSubCategory = ensureAssetSubCategory(categoryId);
      addAssetSubCategoryToList(subTopic.assetSubCategories, assetSubCategory);
      addAssetSubCategoryToList(topic.assetSubCategories, assetSubCategory);
    });
  });

  const filteredTopics = topics.filter(
    (topic) => topic.subTopics.length || topic.assetSubCategories.length || topic.measure
  );

  filteredTopics.forEach((topic) => {
    topic.subTopics.forEach((subTopic) => {
      subTopic.assetSubCategories.sort((a, b) => sortByTitle(a, b));
      delete subTopic._topicRef;
    });

    topic.subTopics.sort((a, b) => sortByTitle(a, b));
    topic.assetSubCategories.sort((a, b) => sortByTitle(a, b));
    delete topic._subTopicCache;
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
