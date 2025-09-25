import { store } from '../../../lib/storage.js';
import { rebuildUnified } from '../../../lib/merge.js';
import { logger } from '../../../lib/logger.js';

export const AssetsController = {
  list: (req, res) => {
    logger.debug('Listing unified assets');
    const schema = store.get('schema').rows.map((row) => row.col_name);
    const assets = store.get('unified_assets').rows;
    res.json({ schema, assets });
  },
  rebuild: (req, res) => {
    logger.info('Rebuilding unified asset table triggered');
    rebuildUnified();
    res.json({ ok: true });
  }
};
