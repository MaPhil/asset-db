import { store } from '../../lib/storage.js';
import { logger } from '../../lib/logger.js';

export const renderSource = (req, res) => {
  const id = Number(req.params.id);
  const source = store.get('sources').rows.find((row) => row.id === id);

  if (!source) {
    logger.warn('Quelle für UI-Route nicht gefunden', { sourceId: id });
    return res.status(404).send('Quelle nicht gefunden');
  }

  const rows = store
    .get('source_rows')
    .rows.filter((row) => row.source_id === id)
    .sort((a, b) => a.row_index - b.row_index)
    .map((row) => row.data);
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  res.render('assets/source', {
    nav: 'assetStructure',
    source,
    rows,
    headers
  });
};
