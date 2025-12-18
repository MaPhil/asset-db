import { readJsonFile, writeJsonFile, ASSET_SUB_CATEGORIES_FILE } from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';

const normalizeText = (value, { trim = true } = {}) => {
  if (typeof value !== 'string') {
    return '';
  }
  return trim ? value.trim() : value;
};

const hasOwnProperty = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const loadAssetSubCategories = () => {
  return readJsonFile(ASSET_SUB_CATEGORIES_FILE, { data: {} });
};

const formatEntries = (payload) => {
  const data = payload?.data ?? {};
  return Object.entries(data)
    .map(([key, entry]) => {
      const normalizedEntry = entry && typeof entry === 'object' ? entry : {};
      const candidateSlug = normalizeText(normalizedEntry.slug) || normalizeText(key);
      if (!candidateSlug) {
        return null;
      }
      const slug = candidateSlug;
      const title =
        normalizeText(normalizedEntry.title) ||
        normalizeText(normalizedEntry.name) ||
        slug ||
        'AssetUnterKategorie';
      return {
        slug,
        title
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      (a.title || '').localeCompare(b.title || '', 'de', { sensitivity: 'base', numeric: true })
    );
};

export const AssetSubCategoriesController = {
  update: (req, res) => {
    const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
    if (!slug) {
      logger.warn('AssetUnterKategorie-Slug fehlt im Update-Request', { params: req.params });
      return res.status(400).json({ error: 'AssetUnterKategorie nicht angegeben.' });
    }

    const payload = loadAssetSubCategories();
    const data = payload?.data ?? {};
    const entry = data[slug];
    if (!entry) {
      logger.warn('AssetUnterKategorie nicht gefunden', { slug });
      return res.status(404).json({ error: 'AssetUnterKategorie nicht gefunden.' });
    }

    const patch = {};
    if (hasOwnProperty(req.body, 'owner')) {
      const owner = normalizeText(req.body.owner);
      patch.owner = owner;
      patch.group_owner = owner;
    }
    if (hasOwnProperty(req.body, 'integrity')) {
      patch.integrity = normalizeText(req.body.integrity);
    }
    if (hasOwnProperty(req.body, 'availability')) {
      patch.availability = normalizeText(req.body.availability);
    }
    if (hasOwnProperty(req.body, 'confidentiality')) {
      patch.confidentiality = normalizeText(req.body.confidentiality);
    }
    if (hasOwnProperty(req.body, 'description')) {
      patch.description = normalizeText(req.body.description, { trim: false });
    }

    if (!Object.keys(patch).length) {
      logger.debug('Keine Aktualisierungsdaten für AssetUnterKategorie übermittelt', { slug });
      return res.status(400).json({ error: 'Keine Aktualisierungsdaten übermittelt.' });
    }

    const updatedEntry = { ...entry, ...patch };
    const updatedData = { ...data, [slug]: updatedEntry };
    const updatedPayload = {
      ...payload,
      data: updatedData,
      meta: {
        ...(payload?.meta ?? {}),
        updatedAt: new Date().toISOString()
      }
    };

    writeJsonFile(ASSET_SUB_CATEGORIES_FILE, updatedPayload);
    logger.info('AssetUnterKategorie aktualisiert', { slug });

    res.json({ ok: true });
  },

  list: (_req, res) => {
    const payload = loadAssetSubCategories();
    const entries = formatEntries(payload);
    res.json({ entries });
  }
};
