import {
  createGroupAssetSelector,
  getGroupAssetSelectorAssets,
  listGroupAssetSelectors,
  updateGroupAssetSelector
} from '../../../lib/groupAssetSelectors.js';
import { logger } from '../../../lib/logger.js';

export const GroupAssetSelectorsController = {
  async list(req, res) {
    const groupId = req.params?.id;
    try {
      const overview = listGroupAssetSelectors(groupId);
      res.json(overview);
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status >= 500) {
        logger.error('Unable to load asset selector overview', error, { groupId });
      } else {
        logger.warn('Unable to load asset selector overview', { groupId, error: error.message });
      }
      res.status(status).json({ error: error.message || 'Asset selectors could not be loaded.' });
    }
  },
  async create(req, res) {
    const groupId = req.params?.id;
    try {
      const entry = createGroupAssetSelector(groupId, req.body);
      res.status(201).json(entry);
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status >= 500) {
        logger.error('Asset selector could not be created', error, { groupId });
      } else {
        logger.warn('Asset selector could not be created', {
          groupId,
          error: error.message,
          payload: req.body
        });
      }
      res.status(status).json({ error: error.message || 'Asset selector could not be created.' });
    }
  },
  async update(req, res) {
    const groupId = req.params?.id;
    const selectorId = req.params?.selectorId;
    try {
      const entry = updateGroupAssetSelector(groupId, selectorId, req.body);
      res.json(entry);
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status >= 500) {
        logger.error('Asset selector could not be updated', error, { groupId, selectorId });
      } else {
        logger.warn('Asset selector could not be updated', {
          groupId,
          selectorId,
          error: error.message,
          payload: req.body
        });
      }
      res.status(status).json({ error: error.message || 'Asset selector could not be updated.' });
    }
  },
  async assets(req, res) {
    const groupId = req.params?.id;
    const selectorId = req.params?.selectorId;
    try {
      const result = getGroupAssetSelectorAssets(groupId, selectorId);
      res.json(result);
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status >= 500) {
        logger.error('Assets for asset selector could not be loaded', error, {
          groupId,
          selectorId
        });
      } else {
        logger.warn('Assets for asset selector could not be loaded', {
          groupId,
          selectorId,
          error: error.message
        });
      }
      res
        .status(status)
        .json({ error: error.message || 'Assets for this asset selector could not be loaded.' });
    }
  }
};
