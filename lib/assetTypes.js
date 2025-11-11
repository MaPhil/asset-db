import { logger } from './logger.js';
import { getSetting, removeSetting, setSetting } from './settings.js';

const SETTINGS_KEY = 'assetTypeField';

function normaliseField(field) {
  if (field === undefined || field === null) {
    return null;
  }
  const value = String(field).trim();
  return value ? value : null;
}

export function getAssetTypeField() {
  return normaliseField(getSetting(SETTINGS_KEY));
}

export function setAssetTypeField(field) {
  const nextField = normaliseField(field);
  const currentField = getAssetTypeField();

  if (!nextField) {
    if (currentField) {
      removeSetting(SETTINGS_KEY);
      logger.info('Einstellung für Asset-Typ-Feld gelöscht');
    }
    return null;
  }

  if (currentField === nextField) {
    return currentField;
  }

  setSetting(SETTINGS_KEY, nextField);
  logger.info('Einstellung für Asset-Typ-Feld aktualisiert', { field: nextField });
  return nextField;
}
