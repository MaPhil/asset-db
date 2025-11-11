import {
  createAssetCategory,
  getAssetCategoryOverview,
  updateAssetCategory
} from '../../../lib/assetCategories.js';
import { logger } from '../../../lib/logger.js';

export const AssetCategoriesController = {
  summary: (req, res) => {
    const overview = getAssetCategoryOverview();
    res.json(overview);
  },

  create: (req, res) => {
    const name = req.body?.name ?? req.body?.title;
    try {
      const entry = createAssetCategory(name);
      const overview = getAssetCategoryOverview();
      res.status(201).json({ ...overview, createdCategoryId: entry.id });
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
      if (statusCode >= 500) {
        logger.error('Asset-Kategorie konnte nicht erstellt werden', error);
      } else {
        logger.warn('Validierungsfehler beim Erstellen einer Asset-Kategorie', {
          error: error?.message,
          name
        });
      }
      res
        .status(statusCode)
        .json({ error: error?.message || 'Asset-Kategorie konnte nicht erstellt werden.' });
    }
  },

  update: (req, res) => {
    const id = req.params?.id;
    try {
      const overview = updateAssetCategory(id, req.body ?? {});
      res.json(overview);
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
      if (statusCode >= 500) {
        logger.error('Asset-Kategorie konnte nicht aktualisiert werden', error, { id });
      } else {
        logger.warn('Validierungsfehler beim Aktualisieren einer Asset-Kategorie', {
          error: error?.message,
          id
        });
      }
      res
        .status(statusCode)
        .json({ error: error?.message || 'Asset-Kategorie konnte nicht aktualisiert werden.' });
    }
  }
};
