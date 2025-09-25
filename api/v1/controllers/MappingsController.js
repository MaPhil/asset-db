import { store } from '../../../lib/storage.js';
import { rebuildUnified } from '../../../lib/merge.js';
import { logger } from '../../../lib/logger.js';

export const MappingsController = {
  addSchemaCol: (req, res) => {
    const column = (req.body.col || '').trim();
    if (!column) {
      logger.warn('Attempted to add schema column without name', {
        path: req.originalUrl
      });
      return res.status(400).json({ error: 'col required' });
    }
    logger.info('Adding schema column', { column });
    store.upsertSchemaCol(column);
    rebuildUnified();
    logger.info('Schema column added and unified assets rebuilt', { column });
    res.json({ ok: true });
  },

  save: (req, res) => {
    const payload = req.body.mappings || {};
    logger.info('Saving mappings', { sourceCount: Object.keys(payload).length });
    const data = store.get('mappings');

    for (const [sourceId, mapping] of Object.entries(payload)) {
      const numericId = Number(sourceId);
      data.rows = data.rows.filter((row) => row.source_id !== numericId);

      for (const [unifiedCol, sourceCol] of Object.entries(mapping)) {
        if (!sourceCol) continue;
        const id = (data.meta.seq ?? 0) + 1;
        data.meta.seq = id;
        data.rows.push({
          id,
          source_id: numericId,
          source_col: sourceCol,
          unified_col: unifiedCol
        });
      }
    }

    store.set('mappings', data);
    rebuildUnified();
    logger.info('Mappings saved and unified assets rebuilt');
    res.json({ ok: true });
  }
};
