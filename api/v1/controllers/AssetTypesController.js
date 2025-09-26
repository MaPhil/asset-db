import { getAssetTypeSummary, saveAssetTypeDecision } from '../../../lib/assetTypes.js';
import { logger } from '../../../lib/logger.js';

export const AssetTypesController = {
  summary: (req, res) => {
    const summary = getAssetTypeSummary();
    res.json(summary);
  },
  updateDecision: (req, res) => {
    const name = String(req.params?.name ?? '').trim();
    try {
      const entry = saveAssetTypeDecision(name, req.body?.decision, req.body?.comment);
      res.json(entry);
    } catch (error) {
      const statusCode = error?.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 400;
      if (statusCode >= 500) {
        logger.error('Asset-Typ-Entscheidung konnte nicht gespeichert werden', { error, name });
      } else {
        logger.warn('Validierungsfehler beim Speichern der Asset-Typ-Entscheidung', {
          error: error?.message,
          name
        });
      }
      res
        .status(statusCode)
        .json({ error: error?.message || 'Asset-Typ-Entscheidung konnte nicht gespeichert werden.' });
    }
  }
};
