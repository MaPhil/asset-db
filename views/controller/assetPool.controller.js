import { store } from '../../lib/storage.js';

export const redirectToAssetPool = (req, res) => {
  res.redirect('/asset-pool');
};

export const redirectAssets = (req, res) => {
  res.redirect('/asset-pool');
};

export const renderAssetPool = (req, res) => {
  res.render('asset-pool', {
    nav: 'assetPool'
  });
};

export const renderRawTable = (req, res) => {
  const rawTableId = Number(req.params.id);
  const rawTable = store.get('raw_tables').rows.find((row) => row.id === rawTableId);
  const status = rawTable ? 200 : 404;
  const hasRows =
    rawTable && store.get('raw_rows').rows.some((row) => row.raw_table_id === rawTableId);

  res.status(status).render('raw-table', {
    nav: 'assetPool',
    rawTableId,
    rawTableTitle: rawTable?.title || null,
    missing: !rawTable,
    hasRows: Boolean(hasRows)
  });
};
