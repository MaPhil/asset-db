import {
  createGroupAssetSelector,
  getGroupAssetSelectorAssets,
  listGroupAssetSelectors,
  updateGroupAssetSelector
} from '../../../lib/groupAssetSelectors.js';
import { logger } from '../../../lib/logger.js';

export const GroupAssetSelectorsController = {
  async list(req, res) {
    const groupSlug = req.groupSlug || (req.group?.slug || '');
    if (!groupSlug) {
      return res.status(400).json({ error: 'Ungültiger Gruppenbezeichner.' });
    }
    try {
      const overview = listGroupAssetSelectors(groupSlug);
      res.json(overview);
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status >= 500) {
        logger.error('Unable to load asset selector overview', error, { groupSlug });
      } else {
        logger.warn('Unable to load asset selector overview', { groupSlug, error: error.message });
      }
      res.status(status).json({ error: error.message || 'Asset selectors could not be loaded.' });
    }
  },
  async create(req, res) {
    const groupSlug = req.groupSlug || (req.group?.slug || '');
    if (!groupSlug) {
      return res.status(400).json({ error: 'Ungültiger Gruppenbezeichner.' });
    }
    try {
      const entry = createGroupAssetSelector(groupSlug, req.body);
      res.status(201).json(entry);
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status >= 500) {
        logger.error('Asset selector could not be created', error, { groupSlug });
      } else {
        logger.warn('Asset selector could not be created', {
          groupSlug,
          error: error.message,
          payload: req.body
        });
      }
      res.status(status).json({ error: error.message || 'Asset selector could not be created.' });
    }
  },
  async update(req, res) {
    const groupSlug = req.groupSlug || (req.group?.slug || '');
    const selectorId = req.params?.selectorId;
    if (!groupSlug) {
      return res.status(400).json({ error: 'Ungültiger Gruppenbezeichner.' });
    }
    try {
      const entry = updateGroupAssetSelector(groupSlug, selectorId, req.body);
      res.json(entry);
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status >= 500) {
        logger.error('Asset selector could not be updated', error, { groupSlug, selectorId });
      } else {
        logger.warn('Asset selector could not be updated', {
          groupSlug,
          selectorId,
          error: error.message,
          payload: req.body
        });
      }
      res.status(status).json({ error: error.message || 'Asset selector could not be updated.' });
    }
  },
  async assets(req, res) {
    const groupSlug = req.groupSlug || (req.group?.slug || '');
    const selectorId = req.params?.selectorId;
    if (!groupSlug) {
      return res.status(400).json({ error: 'Ungültiger Gruppenbezeichner.' });
    }
    try {
      const result = getGroupAssetSelectorAssets(groupSlug, selectorId);
      res.json(result);
    } catch (error) {
      const status = error?.statusCode || 500;
      if (status >= 500) {
        logger.error('Assets for asset selector could not be loaded', error, {
          groupSlug,
          selectorId
        });
      } else {
        logger.warn('Assets for asset selector could not be loaded', {
          groupSlug,
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
