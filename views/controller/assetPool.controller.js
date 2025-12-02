import { readRawAsset } from '../../lib/rawAssetStore.js';

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
  const rawTableId = req.params.id;
  const rawTable = readRawAsset(rawTableId, { archivedPreferred: true });
  const status = rawTable ? 200 : 404;
  const hasRows = Array.isArray(rawTable?.data) && rawTable.data.length > 0;

  res.status(status).render('raw-table', {
    nav: 'assetPool',
    rawTableId,
    rawTableTitle: rawTable?.meta?.title || null,
    missing: !rawTable,
    hasRows: Boolean(hasRows)
  });
};
