import {
  ensureFieldOnAssets,
  getAssetFieldSuggestions,
  getAssetPoolView,
  removeFieldFromAssets,
  updateAsset
} from '../../../lib/assetPool.js';
import { getAssetTypeField as getStoredAssetTypeField, setAssetTypeField } from '../../../lib/assetTypes.js';
import { logger } from '../../../lib/logger.js';

const normalizeFieldName = (value) => String(value ?? '').trim();

const hasMeaningfulValue = (value) => {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  return true;
};

export const AssetPoolController = {
  view: (req, res) => {
    logger.debug('Asset-Pool-Ansicht wird abgerufen');
    const includeArchived = req.query?.includeArchived !== 'false';
    const page = Number(req.query?.page) || 1;
    const pageSize = Number(req.query?.pageSize) || 50;
    const view = getAssetPoolView({ includeArchived, page, pageSize });
    const assetTypeField = getStoredAssetTypeField();
    res.json({ ...view, assetTypeField, suggestions: getAssetFieldSuggestions() });
  },
  addField: (req, res) => {
    const field = normalizeFieldName(req.body?.field);
    if (!field) {
      logger.warn('Versuch, Asset-Pool-Feld ohne Namen hinzuzufügen', {
        path: req.originalUrl
      });
      return res.status(400).json({ error: 'Feldname ist erforderlich.' });
    }

    ensureFieldOnAssets(field);

    logger.info('Asset-Pool-Feld hinzugefügt', { field });

    res.status(201).json({ field });
  },
  removeField: (req, res) => {
    const field = normalizeFieldName(req.params.field);
    if (!field) {
      logger.warn('Versuch, Asset-Pool-Feld ohne Feldnamen zu entfernen', {
        path: req.originalUrl
      });
      return res.status(400).json({ error: 'Feldname ist erforderlich.' });
    }

    removeFieldFromAssets(field);

    logger.info('Feld aus Asset-Pool entfernt', { field });

    res.json({ ok: true });
  },
  updateFieldEditable: (_req, res) => {
    res.json({ ok: true });
  },
  updateFieldValue: (req, res) => {
    const rowId = String(req.params.rowId ?? '');
    const field = normalizeFieldName(req.params.field);
    if (!rowId) {
      logger.warn('Versuch, Asset-Pool-Wert ohne Zeilen-ID zu aktualisieren', {
        path: req.originalUrl
      });
      return res.status(400).json({ error: 'Zeilen-ID ist erforderlich.' });
    }
    if (!field) {
      logger.warn('Versuch, Asset-Pool-Wert ohne Feldnamen zu aktualisieren', {
        path: req.originalUrl
      });
      return res.status(400).json({ error: 'Feldname ist erforderlich.' });
    }

    const rawValue = req.body?.value;
    const value = hasMeaningfulValue(rawValue) ? rawValue : '';
    const updated = updateAsset(rowId, { [field]: value });
    if (!updated) {
      return res.status(404).json({ error: 'Zeile wurde nicht gefunden.' });
    }

    logger.info('Asset-Pool-Feldwert gespeichert', { field, rowId });

    res.json({ field, rowId, value });
  },
  getAssetTypeField: (_req, res) => {
    const field = getStoredAssetTypeField();
    res.json({ field });
  },
  updateAssetTypeField: (req, res) => {
    const rawField = req.body?.field;

    if (rawField === undefined || rawField === null || rawField === '') {
      setAssetTypeField(null);
      return res.json({ field: null });
    }

    const field = String(rawField).trim();
    if (!field) {
      setAssetTypeField(null);
      return res.json({ field: null });
    }

    const storedField = setAssetTypeField(field);
    res.json({ field: storedField });
  }
};
