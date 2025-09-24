import { store } from '../../../lib/storage.js';

export const GroupsController = {
  list: (req, res) => {
    res.json(store.get('groups').rows);
  },

  create: (req, res) => {
    const now = new Date().toISOString();
    const { title, description, status, asset_type } = req.body;
    const id = store.insert('groups', {
      title,
      description,
      status,
      asset_type,
      created_at: now,
      updated_at: now
    });
    res.json({ ok: true, id });
  },

  update: (req, res) => {
    const id = Number(req.params.id);
    const patch = { ...req.body, updated_at: new Date().toISOString() };
    const ok = store.update('groups', id, patch);
    if (!ok) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ ok: true });
  },

  linkCategory: (req, res) => {
    const groupId = Number(req.params.id);
    const categoryId = Number(req.body.category_id);
    const links = store.get('group_categories');
    const exists = links.rows.some(
      (row) => row.group_id === groupId && row.category_id === categoryId
    );

    if (!exists) {
      const id = (links.meta.seq ?? 0) + 1;
      links.meta.seq = id;
      links.rows.push({ id, group_id: groupId, category_id: categoryId });
      store.set('group_categories', links);
    }

    res.json({ ok: true });
  }
};
