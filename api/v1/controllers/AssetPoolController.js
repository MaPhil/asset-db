import { getAssetPoolView } from '../../../lib/assetPool.js';
import { store } from '../../../lib/storage.js';

export const AssetPoolController = {
  view: (req, res) => {
    const view = getAssetPoolView();
    res.json(view);
  },
  removeField: (req, res) => {
    const field = (req.params.field || '').trim();
    if (!field) {
      return res.status(400).json({ error: 'Field name is required.' });
    }

    const mappingStore = store.get('raw_mappings');
    let removed = false;

    mappingStore.rows.forEach((entry) => {
      const pairs = Array.isArray(entry.pairs) ? entry.pairs : [];
      const filtered = pairs.filter((pair) => pair?.assetField !== field);
      if (filtered.length !== pairs.length) {
        entry.pairs = filtered;
        removed = true;
      }
    });

    if (removed) {
      store.set('raw_mappings', mappingStore);
    }

    res.json({ ok: true, removed });
  }
};
