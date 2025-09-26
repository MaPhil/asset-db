import {
  addAssetTypeToGroup,
  getAvailableAssetTypesForGroup,
  listGroupAssetTypes
} from '../../../lib/groupAssetTypes.js';
import { logger } from '../../../lib/logger.js';

export const GroupAssetTypesController = {
  list: (req, res) => {
    const groupId = req.params?.id;
    try {
      const entries = listGroupAssetTypes(groupId);
      res.json({ entries });
    } catch (error) {
      const statusCode =
        error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 400;
      if (statusCode >= 500) {
        logger.error('Failed to list group asset types', { error, groupId });
      } else {
        logger.warn('Validation error while listing group asset types', {
          error: error?.message,
          groupId
        });
      }
      res
        .status(statusCode)
        .json({ error: error?.message || 'Failed to load group asset types.' });
    }
  },

  available: (req, res) => {
    const groupId = req.params?.id;
    try {
      const entries = getAvailableAssetTypesForGroup(groupId);
      res.json({ entries });
    } catch (error) {
      const statusCode =
        error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 400;
      if (statusCode >= 500) {
        logger.error('Failed to load available asset types for group', { error, groupId });
      } else {
        logger.warn('Validation error while loading available asset types for group', {
          error: error?.message,
          groupId
        });
      }
      res
        .status(statusCode)
        .json({ error: error?.message || 'Failed to load available asset types.' });
    }
  },

  create: (req, res) => {
    const groupId = req.params?.id;
    try {
      const entry = addAssetTypeToGroup(groupId, req.body?.name);
      res.status(201).json(entry);
    } catch (error) {
      const statusCode =
        error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 400;
      if (statusCode >= 500) {
        logger.error('Failed to assign asset type to group', { error, groupId });
      } else {
        logger.warn('Validation error while assigning asset type to group', {
          error: error?.message,
          groupId
        });
      }
      res
        .status(statusCode)
        .json({ error: error?.message || 'Failed to assign asset type to group.' });
    }
  }
};
