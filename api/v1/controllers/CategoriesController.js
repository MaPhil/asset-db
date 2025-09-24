import { store } from '../../../lib/storage.js';

export const CategoriesController = {
  list: (req, res) => {
    res.json(store.get('categories').rows);
  },

  create: (req, res) => {
    const { name, confidentiality, availability, group_owner } = req.body;
    const id = store.insert('categories', {
      name,
      confidentiality,
      availability,
      group_owner
    });
    res.json({ ok: true, id });
  },

  get: (req, res) => {
    const id = Number(req.params.id);
    const category = store.get('categories').rows.find((row) => row.id === id);
    if (!category) {
      return res.status(404).json({ error: 'Not found' });
    }

    const links = store.get('group_categories').rows.filter((row) => row.category_id === id);
    const groups = store
      .get('groups')
      .rows.filter((group) => links.some((link) => link.group_id === group.id));

    res.json({ category, groups });
  },

  update: (req, res) => {
    const id = Number(req.params.id);
    const ok = store.update('categories', id, req.body);
    if (!ok) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json({ ok: true });
  }
};
