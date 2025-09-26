import { store } from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';

export const CategoriesController = {
  list: (req, res) => {
    logger.debug('Kategorien werden aufgelistet');
    res.json(store.get('categories').rows);
  },

  create: (req, res) => {
    const {
      title,
      name,
      governing_category,
      owner,
      group_owner,
      integrity,
      availability,
      confidentiality,
      description
    } = req.body;

    const providedName =
      typeof name === 'string' ? name.trim() : name != null ? String(name).trim() : '';
    const normalisedTitle = (title ?? providedName ?? '').toString().trim();
    const resolvedName = providedName || normalisedTitle || undefined;
    const payload = {
      title: normalisedTitle || undefined,
      name: resolvedName,
      governing_category: governing_category ? String(governing_category).trim() : undefined,
      owner: owner ? String(owner).trim() : undefined,
      group_owner: group_owner ? String(group_owner).trim() : owner ? String(owner).trim() : undefined,
      integrity: integrity ? String(integrity).trim() : undefined,
      availability: availability ? String(availability).trim() : undefined,
      confidentiality: confidentiality ? String(confidentiality).trim() : undefined,
      description: description ? String(description).trim() : undefined
    };

    const sanitized = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    );

    logger.info('Kategorie wird erstellt', sanitized);
    const id = store.insert('categories', sanitized);
    logger.info('Kategorie erstellt', { categoryId: id });
    res.json({ ok: true, id });
  },

  get: (req, res) => {
    const id = Number(req.params.id);
    const category = store.get('categories').rows.find((row) => row.id === id);
    if (!category) {
      logger.warn('Kategorie nicht gefunden', { categoryId: id });
      return res.status(404).json({ error: 'Nicht gefunden.' });
    }

    const links = store.get('group_categories').rows.filter((row) => row.category_id === id);
    const groups = store
      .get('groups')
      .rows.filter((group) => links.some((link) => link.group_id === group.id));

    logger.debug('Kategorie abgerufen', { categoryId: id, groupCount: groups.length });
    res.json({ category, groups });
  },

  update: (req, res) => {
    const id = Number(req.params.id);
    const ok = store.update('categories', id, req.body);
    if (!ok) {
      logger.warn('Versuch, fehlende Kategorie zu aktualisieren', { categoryId: id });
      return res.status(404).json({ error: 'Nicht gefunden.' });
    }
    logger.info('Kategorie aktualisiert', { categoryId: id });
    res.json({ ok: true });
  }
};
