import { getAssetPoolView } from '../../../lib/assetPool.js';

export const AssetPoolController = {
  view: (req, res) => {
    const view = getAssetPoolView();
    res.json(view);
  }
};
