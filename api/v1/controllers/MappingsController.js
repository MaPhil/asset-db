import { store } from '../../../lib/storage.js';
import { rebuildUnified } from '../../../lib/merge.js';

export const MappingsController = {
  addSchemaCol: (req, res) => {
    const column = (req.body.col || '').trim();
    if (!column) {
      return res.status(400).json({ error: 'col required' });
    }
    store.upsertSchemaCol(column);
    rebuildUnified();
    res.json({ ok: true });
  },

  save: (req, res) => {
    const payload = req.body.mappings || {};
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
    res.json({ ok: true });
  }
};
