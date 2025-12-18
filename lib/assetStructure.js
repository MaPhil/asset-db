import { ASSET_SUB_CATEGORIES_FILE, MEASURES_FILE, readJsonFile } from './storage.js';

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

const normalizeGroupSlug = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
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

const loadMeasureRows = () => {
  const payload = readJsonFile(MEASURES_FILE, null);
  const data = payload?.data;

  if (!data || typeof data !== 'object' || !Object.keys(data).length) {
    return [];
  }

  return Object.values(data).map((row) => row || {});
};

const loadAssetSubCategoryRows = () => {
  const payload = readJsonFile(ASSET_SUB_CATEGORIES_FILE, null);
  const data = payload?.data;

  if (!data || typeof data !== 'object' || !Object.keys(data).length) {
    return [];
  }

  return Object.values(data).map((row) => row || {});
};

export const buildAssetStructure = () => {
  const measureRows = loadMeasureRows();
  const assetSubCategoryRows = loadAssetSubCategoryRows();

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
  const topicTitleByKey = new Map();

  const addSubTopicName = (topicKey, name) => {
    const list = subTopicNamesByTopicKey.get(topicKey) ?? new Set();
    list.add(name);
    subTopicNamesByTopicKey.set(topicKey, list);
  };

  measureRows.forEach((row) => {
    const topicTitles = parseSemicolonList(row?.Themengebiet);
    const subTopicTitles = parseSemicolonList(row?.['Sub-Themengebiet']);

    const topicKeys = topicTitles.length ? topicTitles : [TOPIC_FALLBACK_KEY];
    topicKeys.forEach((topicKey) => {
      const topicTitle = topicKey === TOPIC_FALLBACK_KEY ? FALLBACK_TOPIC_TITLE : topicKey;
      topicTitleByKey.set(topicKey, topicTitle);

      if (subTopicTitles.length) {
        subTopicTitles.forEach((rawTitle) => {
          const subTopicTitle = rawTitle || FALLBACK_SUB_TOPIC_TITLE;
          addSubTopicName(topicKey, subTopicTitle);
        });
      }
    });
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

  let fallbackTopic = topicByKey.get(TOPIC_FALLBACK_KEY) ?? null;

  const ensureFallbackTopic = () => {
    if (fallbackTopic) {
      return fallbackTopic;
    }

    fallbackTopic = createTopic(FALLBACK_TOPIC_TITLE);
    topicByKey.set(TOPIC_FALLBACK_KEY, fallbackTopic);
    return fallbackTopic;
  };

  const addAssetSubCategoryToList = (list, assetSubCategory) => {
    if (!assetSubCategory || !assetSubCategory.slug) {
      return;
    }
    if (!list.some((entry) => entry.slug === assetSubCategory.slug)) {
      list.push(assetSubCategory);
    }
  };

  const assetSubCategoryCache = new Map();
  const assetSubCategoryRowsBySlug = new Map();

  assetSubCategoryRows.forEach((row) => {
    const rawSlug = normaliseText(row?.slug);
    const fallbackTitle = normaliseText(row?.name) || normaliseText(row?.title) || '';
    const computedSlug = rawSlug || slugify(fallbackTitle) || '';
    if (!computedSlug) {
      return;
    }
    assetSubCategoryRowsBySlug.set(computedSlug, row);
  });

  const ensureAssetSubCategory = (assetSubCategorySlug) => {
    const slug = normaliseText(assetSubCategorySlug);
    if (!slug) {
      return null;
    }

    if (assetSubCategoryCache.has(slug)) {
      return assetSubCategoryCache.get(slug);
    }

    const row = assetSubCategoryRowsBySlug.get(slug) ?? {};
    const title =
      normaliseText(row.title || row.name) ||
      slugify(slug) ||
      `AssetUnterKategorie ${slug}`;
    const groups = Array.isArray(row.groups)
      ? row.groups
          .map((value) => normalizeGroupSlug(value))
          .filter((value, index, array) => value && array.indexOf(value) === index)
      : [];
    const entry = {
      slug,
      title,
      name: title,
      owner: normaliseText(row.owner) || '',
      group_owner: normaliseText(row.group_owner) || '',
      integrity: normaliseText(row.integrity) || '',
      availability: normaliseText(row.availability) || '',
      confidentiality: normaliseText(row.confidentiality) || '',
      description: normaliseText(row.description) || '',
      groups,
      measure: createMeasureReference(row.measure) || null
    };

    assetSubCategoryCache.set(slug, entry);
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
        ensureSubTopic(topic, subTopicName);
      });
  });

  const topicTitleLookup = new Map();
  topicByKey.forEach((topic, topicKey) => {
    topicTitleLookup.set(normaliseText(topic.title), { topicKey, topic });
  });

  assetSubCategoryRowsBySlug.forEach((row, assetSubCategorySlug) => {
    const assetSubCategory = ensureAssetSubCategory(assetSubCategorySlug);
    if (!assetSubCategory) {
      return;
    }

    const links = Array.isArray(row.links) && row.links.length
      ? row.links
      : [{ topicTitle: null, subTopicTitle: null }];

    links.forEach((link) => {
      const topicTitle = normaliseText(link?.topicTitle);
      const topicEntry = topicTitle ? topicTitleLookup.get(topicTitle) : null;
      const topicKey = topicEntry?.topicKey ?? TOPIC_FALLBACK_KEY;
      const topic = topicEntry?.topic ?? ensureFallbackTopic();

      const allowedSubTopics = subTopicNamesByTopicKey.get(topicKey) ?? new Set();
      let resolvedSubTopicTitle = normaliseText(link?.subTopicTitle);

      if (resolvedSubTopicTitle && allowedSubTopics.size && !allowedSubTopics.has(resolvedSubTopicTitle)) {
        resolvedSubTopicTitle = null;
      }

      if (!resolvedSubTopicTitle) {
        if (!allowedSubTopics.size) {
          resolvedSubTopicTitle = FALLBACK_SUB_TOPIC_TITLE;
        } else if (allowedSubTopics.has(FALLBACK_SUB_TOPIC_TITLE)) {
          resolvedSubTopicTitle = FALLBACK_SUB_TOPIC_TITLE;
        } else {
          resolvedSubTopicTitle = Array.from(allowedSubTopics)[0];
        }
      }

      const subTopic = ensureSubTopic(topic, resolvedSubTopicTitle);
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
  const topicByAssetSubCategorySlug = new Map();
  const subTopicByAssetSubCategorySlug = new Map();

  filteredTopics.forEach((topic) => {
    topicById.set(topic.id, topic);

    topic.subTopics.forEach((subTopic) => {
      subTopicById.set(createSubTopicKey(topic.id, subTopic.id), subTopic);

      subTopic.assetSubCategories.forEach((assetSubCategory) => {
        const slug = assetSubCategory.slug;
        if (!slug) {
          return;
        }
        if (!topicByAssetSubCategorySlug.has(slug)) {
          topicByAssetSubCategorySlug.set(slug, topic);
        }
        if (!subTopicByAssetSubCategorySlug.has(slug)) {
          subTopicByAssetSubCategorySlug.set(slug, { topic, subTopic });
        }
      });
    });
  });

  return {
    topics: filteredTopics,
    topicById,
    subTopicById,
    topicByAssetSubCategorySlug,
    subTopicByAssetSubCategorySlug
  };
};

export const getAssetSubCategoryLocation = (assetSubCategorySlug) => {
  const { subTopicByAssetSubCategorySlug } = buildAssetStructure();
  return subTopicByAssetSubCategorySlug.get(assetSubCategorySlug) ?? null;
};

export const getSubTopicKey = createSubTopicKey;
export const TOPIC_FALLBACK_TITLE = FALLBACK_TOPIC_TITLE;
export const SUB_TOPIC_FALLBACK_TITLE = FALLBACK_SUB_TOPIC_TITLE;
export { normaliseText, slugify, ensureUniqueSlug };
