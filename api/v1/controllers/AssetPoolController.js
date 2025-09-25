import { getAssetPoolView } from '../../../lib/assetPool.js';
import { store } from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';

export const AssetPoolController = {
  view: (req, res) => {
    logger.debug('Fetching asset pool view');
    const view = getAssetPoolView();
    res.json(view);
  },
  removeField: (req, res) => {
    const field = (req.params.field || '').trim();
    if (!field) {
      logger.warn('Attempted to remove asset pool field without providing a field name', {
        path: req.originalUrl
      });
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

    logger.info('Removed field from raw mappings', {
      field,
      removed
    });

    res.json({ ok: true, removed });
  }
};
