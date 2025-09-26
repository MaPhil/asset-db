import { store } from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';

export const GroupsController = {
  list: (req, res) => {
    logger.debug('Gruppen werden aufgelistet');
    res.json(store.get('groups').rows);
  },

  create: (req, res) => {
    const now = new Date().toISOString();
    const { title, description, status, asset_type } = req.body;
    logger.info('Gruppe wird erstellt', { title, status, asset_type });
    const id = store.insert('groups', {
      title,
      description,
      status,
      asset_type,
      created_at: now,
      updated_at: now
    });
    logger.info('Gruppe erstellt', { groupId: id });
    res.json({ ok: true, id });
  },

  update: (req, res) => {
    const id = Number(req.params.id);
    const patch = { ...req.body, updated_at: new Date().toISOString() };
    const ok = store.update('groups', id, patch);
    if (!ok) {
      logger.warn('Versuch, fehlende Gruppe zu aktualisieren', { groupId: id });
      return res.status(404).json({ error: 'Not found' });
    }
    logger.info('Gruppe aktualisiert', { groupId: id });
    res.json({ ok: true });
  },

  linkCategory: (req, res) => {
    const groupId = Number(req.params.id);
    const categoryId = Number(req.body.category_id);
    logger.debug('Kategorie wird mit Gruppe verknüpft', { groupId, categoryId });
    const links = store.get('group_categories');
    const exists = links.rows.some(
      (row) => row.group_id === groupId && row.category_id === categoryId
    );

    if (!exists) {
      const id = (links.meta.seq ?? 0) + 1;
      links.meta.seq = id;
      links.rows.push({ id, group_id: groupId, category_id: categoryId });
      store.set('group_categories', links);
      logger.info('Kategorie mit Gruppe verknüpft', { groupId, categoryId });
    } else {
      logger.debug('Kategorie bereits mit Gruppe verknüpft', { groupId, categoryId });
    }

    res.json({ ok: true });
  }
};
