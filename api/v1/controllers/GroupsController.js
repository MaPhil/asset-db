import {
  store,
  readJsonFile,
  writeJsonFile,
  ASSET_SUB_CATEGORIES_FILE
} from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';
import { slugify, ensureUniqueSlug } from '../../../lib/assetStructure.js';

const normalizeSlug = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const normalizeText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const collectCategorySlugValues = (payload) => {
  const values = [];
  const addValue = (value) => {
    const normalized = normalizeSlug(value);
    if (!normalized || values.includes(normalized)) {
      return;
    }
    values.push(normalized);
  };

  const pushSource = (source) => {
    if (Array.isArray(source)) {
      source.forEach(addValue);
    } else if (source) {
      addValue(source);
    }
  };

  if (!payload || typeof payload !== 'object') {
    return values;
  }

  pushSource(payload.category_slugs);
  pushSource(payload.category_slug);
  return values;
};

const hasOwnProperty = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const buildCategorySlugPatch = (payload = {}) => {
  if (!hasOwnProperty(payload, 'category_slugs') && !hasOwnProperty(payload, 'category_slug')) {
    return {};
  }

  return { category_slug: collectCategorySlugValues(payload) };
};

const extractAssetSubCategorySlug = (body = {}) => {
  const candidates = [
    normalizeSlug(body.asset_sub_category),
    normalizeSlug(body.asset_sub_category_slug),
    normalizeSlug(body.category_slug && (Array.isArray(body.category_slug) ? body.category_slug[0] : body.category_slug))
  ].filter(Boolean);
  return candidates.length ? candidates[0] : '';
};

const linkGroupToAssetSubCategories = (categorySlugs, groupSlug) => {
  if (!groupSlug || !categorySlugs?.length) {
    return;
  }
  const payload = readJsonFile(ASSET_SUB_CATEGORIES_FILE, { data: {} });
  const data = payload?.data ?? {};
  let updated = false;

  categorySlugs.forEach((categorySlug) => {
    const normalized = normalizeSlug(categorySlug);
    if (!normalized) {
      return;
    }
    const entry = data[normalized];
    if (!entry) {
      return;
    }
    const groups = Array.isArray(entry.groups) ? entry.groups : [];
    if (!groups.includes(groupSlug)) {
      groups.push(groupSlug);
      entry.groups = groups;
      updated = true;
    }
  });

  if (!updated) {
    return;
  }

  const updatedPayload = {
    ...payload,
    data,
    meta: {
      ...(payload?.meta ?? {}),
      updatedAt: new Date().toISOString()
    }
  };

  writeJsonFile(ASSET_SUB_CATEGORIES_FILE, updatedPayload);
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

const getGroupCategorySlugs = (group) => {
  const entries = [];

  if (Array.isArray(group?.category_slug)) {
    entries.push(...group.category_slug);
  } else if (group?.category_slug) {
    entries.push(group.category_slug);
  }

  if (Array.isArray(group?.category_slugs)) {
    entries.push(...group.category_slugs);
  } else if (group?.category_slugs) {
    entries.push(group.category_slugs);
  }

  return entries
    .map((value) => normalizeSlug(value))
    .filter((value, index, array) => value && array.indexOf(value) === index);
};

export const GroupsController = {
  list: (req, res) => {
    logger.debug('Gruppen werden aufgelistet');
    res.json(store.get('groups').rows);
  },

  create: (req, res) => {
    const now = new Date().toISOString();
    const { title, description, status, asset_type } = req.body;
    const groupsTable = store.get('groups');
    const existingSlugs = new Set(
      Array.isArray(groupsTable?.rows)
        ? groupsTable.rows.map((row) => row?.slug).filter((slug) => typeof slug === 'string' && slug.trim())
        : []
    );
    const baseSlug = slugify(title || 'gruppe');
    const slug = ensureUniqueSlug(existingSlugs, baseSlug, 'gruppe');
    const categorySlugs = collectCategorySlugValues(req.body);
    const owner = normalizeText(req.body.owner || '');
    const assetSubCategorySlug =
      extractAssetSubCategorySlug(req.body) || categorySlugs[0] || '';
    logger.info('Gruppe wird erstellt', { title, status, asset_type, slug });
    const record = {
      title,
      name: title,
      description,
      status,
      asset_type,
      owner,
      group_owner: owner,
      slug,
      assets: Array.isArray(req.body.assets) ? req.body.assets : [],
      selector: Array.isArray(req.body.selector) ? req.body.selector : [],
      implementation_measures: req.body.implementation_measures || {},
      asset_sub_category: assetSubCategorySlug,
      integrity: normalizeText(req.body.integrity || ''),
      availability: normalizeText(req.body.availability || ''),
      confidentiality: normalizeText(req.body.confidentiality || ''),
      created_at: now,
      updated_at: now
    };
    if (categorySlugs.length) {
      record.category_slug = categorySlugs;
    }
    const id = store.insert('groups', record);
    if (categorySlugs.length) {
      linkGroupToAssetSubCategories(categorySlugs, slug);
    }
    logger.info('Gruppe erstellt', { groupId: id });
    res.json({ ok: true, id, slug });
  },

  update: (req, res) => {
    const id = Number(req.params.id);
    const { category_slugs, category_slug, ...rest } = req.body || {};
    const slugPatch = buildCategorySlugPatch({ category_slugs, category_slug });
    const patch = {
      ...rest,
      ...slugPatch,
      updated_at: new Date().toISOString()
    };
    const ok = store.update('groups', id, patch);
    if (!ok) {
      logger.warn('Versuch, fehlende Gruppe zu aktualisieren', { groupId: id });
      return res.status(404).json({ error: 'Nicht gefunden.' });
    }

    const categorySlugs = Array.isArray(slugPatch.category_slug) ? slugPatch.category_slug : [];
    if (categorySlugs.length && req.group) {
      const groupSlug = req.group.slug || slugify(req.group.title || `gruppe-${id}`);
      linkGroupToAssetSubCategories(categorySlugs, groupSlug);
    }

    logger.info('Gruppe aktualisiert', { groupId: id });
    res.json({ ok: true });
  },

  destroy: (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      logger.warn('Ungültiger Gruppenbezeichner für Löschvorgang', { groupId: req.params.id });
      return res.status(400).json({ error: 'Ungültiger Gruppenbezeichner.' });
    }

    const groupsTable = store.get('groups');
    const group = groupsTable.rows.find((row) => row.id === id);
    if (!group) {
      logger.warn('Versuch, fehlende Gruppe zu löschen', { groupId: id });
      return res.status(404).json({ error: 'Nicht gefunden.' });
    }

    const assignmentsTable = store.get('group_asset_types');
    const assignedAssetTypes = assignmentsTable.rows.filter(
      (row) => Number(row?.group_id) === id
    );
    const selectorTable = store.get('group_asset_selectors');
    const selectorCount = selectorTable.rows.filter((row) => Number(row?.group_id) === id).length;
    const hasLegacyAssetType = Boolean(group?.asset_type && String(group.asset_type).trim());

    if (assignedAssetTypes.length > 0 || hasLegacyAssetType || selectorCount > 0) {
      logger.warn('Gruppe mit zugewiesenen Asset-Typen oder Asset-Selectoren kann nicht gelöscht werden', {
        groupId: id,
        assignmentCount: assignedAssetTypes.length,
        selectorCount,
        hasLegacyAssetType
      });
      return res
        .status(409)
        .json({
          error:
            'Gruppe kann nicht gelöscht werden, solange Asset-Typen oder Asset-Selectoren zugeordnet sind.'
        });
    }

    store.remove('groups', id);
    logger.info('Gruppe gelöscht', { groupId: id });
    res.json({ ok: true });
  },

  linkCategory: (req, res) => {
    const groupId = Number(req.params.id);
    const categoryId = Number(req.body.category_id);
    const categorySlug = normalizeSlug(req.body.category_slug);
    logger.debug('Kategorie wird mit Gruppe verknüpft', { groupId, categoryId, categorySlug });
    const groupsTable = store.get('groups');
    const groups = Array.isArray(groupsTable?.rows) ? groupsTable.rows : [];
    const group = groups.find((row) => row.id === groupId);

    if (!group) {
      logger.warn('Versuch, fehlende Gruppe zu verknüpfen', { groupId, categoryId });
      return res.status(404).json({ error: 'Gruppe nicht gefunden.' });
    }

    if (!categorySlug && (!Number.isInteger(categoryId) || categoryId <= 0)) {
      logger.warn('Keine gültige Kategorie angegeben', { groupId, payload: req.body });
      return res.status(400).json({ error: 'Ungültige Kategorie.' });
    }

    const categoryIds = getGroupCategoryIds(group);

    const existingSlugs = getGroupCategorySlugs(group);

    const updatedCategories = [...categoryIds];
    const updatedSlugs = [...existingSlugs];

    if (Number.isInteger(categoryId) && categoryId > 0 && !updatedCategories.includes(categoryId)) {
      updatedCategories.push(categoryId);
    }

    if (categorySlug && !updatedSlugs.includes(categorySlug)) {
      updatedSlugs.push(categorySlug);
    }

    const updates = { updated_at: new Date().toISOString() };
    if (updatedCategories.length > 0) {
      updates.category_ids = updatedCategories;
    } else if (group?.category_ids && !updatedCategories.length) {
      updates.category_ids = [];
    }
    if (updatedSlugs.length > 0) {
      updates.category_slug = updatedSlugs;
    }

    store.update('groups', groupId, updates);
    const groupSlug = group.slug || slugify(group.title || `gruppe-${groupId}`);
    if (updatedSlugs.length) {
      linkGroupToAssetSubCategories(updatedSlugs, groupSlug);
    }
    logger.info('Kategorie mit Gruppe verknüpft', { groupId, categoryId });

    res.json({ ok: true });
  }
};
