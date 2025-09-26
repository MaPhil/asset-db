import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import { logger } from './logger.js';

const PREVIEW_DIR = path.join(process.cwd(), 'uploads', 'previews');

export function ensurePreviewDir() {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

export function createPreview(payload) {
  ensurePreviewDir();
  const id = randomUUID();
  const filePath = path.join(PREVIEW_DIR, `${id}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    logger.error('Vorschau-Datei konnte nicht erstellt werden', error, { filePath });
    throw error;
  }
  logger.debug('Vorschau-Datei erstellt', { previewId: id, filePath });
  return { id, filePath };
}

export function readPreview(id) {
  ensurePreviewDir();
  const filePath = path.join(PREVIEW_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    logger.warn('Vorschau-Datei nicht gefunden', { previewId: id });
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    logger.debug('Vorschau-Datei gelesen', { previewId: id });
    return data;
  } catch (error) {
    logger.error('Vorschau-Datei konnte nicht gelesen werden', error, { previewId: id, filePath });
    throw error;
  }
}

export function deletePreview(id) {
  ensurePreviewDir();
  const filePath = path.join(PREVIEW_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      logger.debug('Vorschau-Datei gelöscht', { previewId: id });
    } catch (error) {
      logger.error('Vorschau-Datei konnte nicht gelöscht werden', error, { previewId: id, filePath });
      throw error;
    }
  }
}
