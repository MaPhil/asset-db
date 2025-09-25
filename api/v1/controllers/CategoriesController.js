import { store } from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';

export const CategoriesController = {
  list: (req, res) => {
    logger.debug('Listing categories');
    res.json(store.get('categories').rows);
  },

  create: (req, res) => {
    const { name, confidentiality, availability, group_owner } = req.body;
    logger.info('Creating category', { name, confidentiality, availability, group_owner });
    const id = store.insert('categories', {
      name,
      confidentiality,
      availability,
      group_owner
    });
    logger.info('Category created', { categoryId: id });
    res.json({ ok: true, id });
  },

  get: (req, res) => {
    const id = Number(req.params.id);
    const category = store.get('categories').rows.find((row) => row.id === id);
    if (!category) {
      logger.warn('Category not found', { categoryId: id });
      return res.status(404).json({ error: 'Not found' });
    }

    const links = store.get('group_categories').rows.filter((row) => row.category_id === id);
    const groups = store
      .get('groups')
      .rows.filter((group) => links.some((link) => link.group_id === group.id));

    logger.debug('Category retrieved', { categoryId: id, groupCount: groups.length });
    res.json({ category, groups });
  },

  update: (req, res) => {
    const id = Number(req.params.id);
    const ok = store.update('categories', id, req.body);
    if (!ok) {
      logger.warn('Attempted to update missing category', { categoryId: id });
      return res.status(404).json({ error: 'Not found' });
    }
    logger.info('Category updated', { categoryId: id });
    res.json({ ok: true });
  }
};
