import { store } from '../../../lib/storage.js';
import { rebuildUnified } from '../../../lib/merge.js';

export const AssetsController = {
  list: (req, res) => {
    const schema = store.get('schema').rows.map((row) => row.col_name);
    const assets = store.get('unified_assets').rows;
    res.json({ schema, assets });
  },
  rebuild: (req, res) => {
    rebuildUnified();
    res.json({ ok: true });
  }
};
