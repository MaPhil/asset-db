import {
  addAssetTypeToGroup,
  getAvailableAssetTypesForGroup,
  listGroupAssetTypes,
  removeAssetTypeFromGroup
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
        logger.error('Gruppen-Asset-Typen konnten nicht aufgelistet werden', { error, groupId });
      } else {
        logger.warn('Validierungsfehler beim Auflisten der Gruppen-Asset-Typen', {
          error: error?.message,
          groupId
        });
      }
      res
        .status(statusCode)
        .json({ error: error?.message || 'Gruppen-Asset-Typen konnten nicht geladen werden.' });
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
        logger.error('Verfügbare Asset-Typen für Gruppe konnten nicht geladen werden', {
          error,
          groupId
        });
      } else {
        logger.warn('Validierungsfehler beim Laden verfügbarer Asset-Typen für Gruppe', {
          error: error?.message,
          groupId
        });
      }
      res
        .status(statusCode)
        .json({ error: error?.message || 'Verfügbare Asset-Typen konnten nicht geladen werden.' });
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
        logger.error('Asset-Typ konnte Gruppe nicht zugewiesen werden', { error, groupId });
      } else {
        logger.warn('Validierungsfehler bei der Zuweisung eines Asset-Typs zur Gruppe', {
          error: error?.message,
          groupId
        });
      }
      res
        .status(statusCode)
        .json({ error: error?.message || 'Asset-Typ konnte der Gruppe nicht zugewiesen werden.' });
    }
  },

  destroy: (req, res) => {
    const groupId = req.params?.id;
    const assetTypeId = req.params?.assetTypeId;
    try {
      const entry = removeAssetTypeFromGroup(groupId, assetTypeId);
      res.json(entry);
    } catch (error) {
      const statusCode =
        error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 400;
      if (statusCode >= 500) {
        logger.error('Asset-Typ konnte nicht aus Gruppe entfernt werden', {
          error,
          groupId,
          assetTypeId
        });
      } else {
        logger.warn('Validierungsfehler beim Entfernen eines Asset-Typs aus der Gruppe', {
          error: error?.message,
          groupId,
          assetTypeId
        });
      }
      res
        .status(statusCode)
        .json({ error: error?.message || 'Asset-Typ konnte nicht aus der Gruppe entfernt werden.' });
    }
  }
};
