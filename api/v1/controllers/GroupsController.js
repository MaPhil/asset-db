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
    logger.debug('Kategorie wird mit Gruppe verknüpft', { groupId, categoryId });
    const groupsTable = store.get('groups');
    const groups = Array.isArray(groupsTable?.rows) ? groupsTable.rows : [];
    const group = groups.find((row) => row.id === groupId);

    if (!group) {
      logger.warn('Versuch, fehlende Gruppe zu verknüpfen', { groupId, categoryId });
      return res.status(404).json({ error: 'Gruppe nicht gefunden.' });
    }

    const categoryIds = Array.isArray(group?.category_ids)
      ? group.category_ids
      : group?.category_id
        ? [group.category_id]
        : [];

    if (categoryIds.some((value) => Number(value) === categoryId)) {
      logger.debug('Kategorie bereits mit Gruppe verknüpft', { groupId, categoryId });
      return res.json({ ok: true });
    }

    const updatedCategories = [...categoryIds, categoryId].filter((value, index, array) => {
      return Number.isInteger(Number(value)) && Number(value) > 0 && array.indexOf(value) === index;
    });

    store.update('groups', groupId, {
      category_ids: updatedCategories,
      updated_at: new Date().toISOString()
    });
    logger.info('Kategorie mit Gruppe verknüpft', { groupId, categoryId });

    res.json({ ok: true });
  }
};
