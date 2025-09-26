import { store } from '../../../lib/storage.js';
import { rebuildUnified } from '../../../lib/merge.js';
import { logger } from '../../../lib/logger.js';

export const MappingsController = {
  addSchemaCol: (req, res) => {
    const column = (req.body.col || '').trim();
    if (!column) {
      logger.warn('Versuch, Schema-Spalte ohne Namen hinzuzufügen', {
        path: req.originalUrl
      });
      return res.status(400).json({ error: 'col required' });
    }
    logger.info('Schema-Spalte wird hinzugefügt', { column });
    store.upsertSchemaCol(column);
    rebuildUnified();
    logger.info('Schema-Spalte hinzugefügt und vereinheitlichte Assets neu aufgebaut', { column });
    res.json({ ok: true });
  },

  save: (req, res) => {
    const payload = req.body.mappings || {};
    logger.info('Zuordnungen werden gespeichert', { sourceCount: Object.keys(payload).length });
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
    logger.info('Zuordnungen gespeichert und vereinheitlichte Assets neu aufgebaut');
    res.json({ ok: true });
  }
};
