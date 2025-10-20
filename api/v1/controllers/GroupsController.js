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
      return res.status(404).json({ error: 'Nicht gefunden.' });
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
    const hasLegacyAssetType = Boolean(group?.asset_type && String(group.asset_type).trim());

    if (assignedAssetTypes.length > 0 || hasLegacyAssetType) {
      logger.warn('Gruppe mit zugewiesenen Asset-Typen kann nicht gelöscht werden', {
        groupId: id,
        assignmentCount: assignedAssetTypes.length,
        hasLegacyAssetType
      });
      return res
        .status(409)
        .json({ error: 'Gruppe kann nicht gelöscht werden, solange Asset-Typen zugeordnet sind.' });
    }

    const groupCategoryTable = store.get('group_categories');
    const filteredLinks = groupCategoryTable.rows.filter((row) => Number(row?.group_id) !== id);
    if (filteredLinks.length !== groupCategoryTable.rows.length) {
      store.set('group_categories', { ...groupCategoryTable, rows: filteredLinks });
    }

    store.remove('groups', id);
    logger.info('Gruppe gelöscht', { groupId: id });
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
