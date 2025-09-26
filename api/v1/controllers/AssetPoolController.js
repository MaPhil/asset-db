import { getAssetPoolView } from '../../../lib/assetPool.js';
import {
  getAssetTypeField as getStoredAssetTypeField,
  setAssetTypeField as setStoredAssetTypeField
} from '../../../lib/assetTypes.js';
import { store } from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';

export const AssetPoolController = {
  view: (req, res) => {
    logger.debug('Asset-Pool-Ansicht wird abgerufen');
    const view = getAssetPoolView();
    const assetTypeField = getStoredAssetTypeField();
    res.json({ ...view, assetTypeField });
  },
  removeField: (req, res) => {
    const field = (req.params.field || '').trim();
    if (!field) {
      logger.warn('Versuch, Asset-Pool-Feld ohne Feldnamen zu entfernen', {
        path: req.originalUrl
      });
      return res.status(400).json({ error: 'Feldname ist erforderlich.' });
    }

    const mappingStore = store.get('raw_mappings');
    let removed = false;

    mappingStore.rows.forEach((entry) => {
      const pairs = Array.isArray(entry.pairs) ? entry.pairs : [];
      const filtered = pairs.filter((pair) => pair?.assetField !== field);
      if (filtered.length !== pairs.length) {
        entry.pairs = filtered;
        removed = true;
      }
    });

    if (removed) {
      store.set('raw_mappings', mappingStore);
    }

    logger.info('Feld aus Roh-Zuordnungen entfernt', {
      field,
      removed
    });

    res.json({ ok: true, removed });
  },
  getAssetTypeField: (req, res) => {
    const field = getStoredAssetTypeField();
    res.json({ field });
  },
  updateAssetTypeField: (req, res) => {
    const rawField = req.body?.field;

    if (rawField === undefined || rawField === null || rawField === '') {
      setStoredAssetTypeField(null);
      return res.json({ field: null });
    }

    const field = String(rawField).trim();
    if (!field) {
      setStoredAssetTypeField(null);
      return res.json({ field: null });
    }

    const view = getAssetPoolView();
    const available = new Set(
      Array.isArray(view?.fieldStats) ? view.fieldStats.map((stat) => stat.field) : []
    );

    if (!available.has(field)) {
      logger.warn('Versuch, Asset-Typ-Feld auf nicht verfügbares Feld zu setzen', { field });
      return res
        .status(400)
        .json({ error: 'Das ausgewählte Feld ist im Asset-Pool nicht verfügbar.' });
    }

    const storedField = setStoredAssetTypeField(field);
    res.json({ field: storedField });
  }
};
