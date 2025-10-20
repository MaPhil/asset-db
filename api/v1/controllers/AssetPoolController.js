import { getAssetPoolView } from '../../../lib/assetPool.js';
import {
  getAssetTypeField as getStoredAssetTypeField,
  setAssetTypeField as setStoredAssetTypeField
} from '../../../lib/assetTypes.js';
import { store } from '../../../lib/storage.js';
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

const parseBoolean = (value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return Boolean(value);
};

export const AssetPoolController = {
  view: (req, res) => {
    logger.debug('Asset-Pool-Ansicht wird abgerufen');
    const view = getAssetPoolView();
    const assetTypeField = getStoredAssetTypeField();
    res.json({ ...view, assetTypeField });
  },
  addField: (req, res) => {
    const field = normalizeFieldName(req.body?.field);
    if (!field) {
      logger.warn('Versuch, Asset-Pool-Feld ohne Namen hinzuzufügen', {
        path: req.originalUrl
      });
      return res.status(400).json({ error: 'Feldname ist erforderlich.' });
    }

    const view = getAssetPoolView();
    const existingFields = new Set(
      Array.isArray(view?.fieldStats) ? view.fieldStats.map((stat) => stat.field.toLowerCase()) : []
    );

    if (existingFields.has(field.toLowerCase())) {
      logger.warn('Versuch, bereits vorhandenes Asset-Pool-Feld hinzuzufügen', { field });
      return res.status(409).json({ error: 'Dieses Feld ist bereits vorhanden.' });
    }

    const payload = {
      field,
      editable: true,
      manual: true,
      created_at: new Date().toISOString()
    };
    store.insert('asset_pool_fields', payload);

    logger.info('Asset-Pool-Feld hinzugefügt', { field });

    res.status(201).json({ field: payload });
  },
  removeField: (req, res) => {
    const field = normalizeFieldName(req.params.field);
    if (!field) {
      logger.warn('Versuch, Asset-Pool-Feld ohne Feldnamen zu entfernen', {
        path: req.originalUrl
      });
      return res.status(400).json({ error: 'Feldname ist erforderlich.' });
    }

    const mappingStore = store.get('raw_mappings');
    let removed = false;
    let removedMappings = false;

    mappingStore.rows.forEach((entry) => {
      const pairs = Array.isArray(entry.pairs) ? entry.pairs : [];
      const filtered = pairs.filter((pair) => pair?.assetField !== field);
      if (filtered.length !== pairs.length) {
        entry.pairs = filtered;
        removed = true;
        removedMappings = true;
      }
    });

    if (removed) {
      store.set('raw_mappings', mappingStore);
    }

    const fieldStore = store.get('asset_pool_fields');
    const originalFieldCount = fieldStore.rows.length;
    fieldStore.rows = fieldStore.rows.filter((entry) => entry?.field !== field);
    if (fieldStore.rows.length !== originalFieldCount) {
      store.set('asset_pool_fields', fieldStore);
      removed = true;
    }

    const cellStore = store.get('asset_pool_cells');
    const originalCellCount = cellStore.rows.length;
    cellStore.rows = cellStore.rows.filter((entry) => entry?.field !== field);
    if (cellStore.rows.length !== originalCellCount) {
      store.set('asset_pool_cells', cellStore);
      removed = true;
    }

    if (getStoredAssetTypeField() === field) {
      setStoredAssetTypeField(null);
    }

    logger.info('Feld aus Asset-Pool entfernt', {
      field,
      removed,
      removedMappings,
      removedManual: originalFieldCount !== fieldStore.rows.length,
      removedValues: originalCellCount !== cellStore.rows.length
    });

    res.json({ ok: true, removed });
  },
  updateFieldEditable: (req, res) => {
    const field = normalizeFieldName(req.params.field);
    if (!field) {
      logger.warn('Versuch, Bearbeitbarkeit ohne Feldnamen zu aktualisieren', {
        path: req.originalUrl
      });
      return res.status(400).json({ error: 'Feldname ist erforderlich.' });
    }

    const editable = parseBoolean(req.body?.editable);
    const fields = store.get('asset_pool_fields');
    const existing = fields.rows.find((entry) => entry?.field === field);

    if (existing) {
      store.update('asset_pool_fields', existing.id, { editable });
    } else {
      const payload = {
        field,
        editable,
        manual: false,
        created_at: new Date().toISOString()
      };
      store.insert('asset_pool_fields', payload);
    }

    logger.info('Bearbeitbarkeit für Asset-Pool-Feld aktualisiert', { field, editable });

    res.json({ field, editable });
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

    const fields = store.get('asset_pool_fields');
    const fieldConfig = fields.rows.find((entry) => entry?.field === field);
    if (!fieldConfig || fieldConfig.editable !== true) {
      logger.warn('Versuch, nicht bearbeitbares Feld zu aktualisieren', { field, rowId });
      return res.status(400).json({ error: 'Dieses Feld kann nicht bearbeitet werden.' });
    }

    const view = getAssetPoolView();
    const rowExists = Array.isArray(view?.rows) && view.rows.some((row) => row.id === rowId);
    if (!rowExists) {
      logger.warn('Versuch, Wert für fehlende Zeile zu setzen', { field, rowId });
      return res.status(404).json({ error: 'Zeile wurde nicht gefunden.' });
    }

    const rawValue = req.body?.value;
    const cells = store.get('asset_pool_cells');
    const existing = cells.rows.find((entry) => entry.row_id === rowId && entry.field === field);

    if (!hasMeaningfulValue(rawValue)) {
      if (existing) {
        store.remove('asset_pool_cells', existing.id);
      }
      logger.info('Asset-Pool-Feldwert zurückgesetzt', { field, rowId });
      return res.json({ field, rowId, value: null });
    }

    const value = typeof rawValue === 'string' ? rawValue : String(rawValue);

    if (existing) {
      store.update('asset_pool_cells', existing.id, { value });
    } else {
      store.insert('asset_pool_cells', { row_id: rowId, field, value });
    }

    logger.info('Asset-Pool-Feldwert gespeichert', { field, rowId });

    res.json({ field, rowId, value });
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
