import fs from 'fs';
import path from 'path';

import {
  ARCHIVED_RAW_ASSETS_DIR,
  RAW_ASSETS_DIR,
  readJsonFile,
  writeJsonFile,
  ensureDirectoryExists
} from './storage.js';

function buildPath(uploadId, archived = false) {
  return path.join(archived ? ARCHIVED_RAW_ASSETS_DIR : RAW_ASSETS_DIR, `${uploadId}.json`);
}

export function saveRawAsset(uploadId, payload, { archived = false } = {}) {
  const target = buildPath(uploadId, archived);
  ensureDirectoryExists(path.dirname(target));
  writeJsonFile(target, payload);
  return payload;
}

export function readRawAsset(uploadId, { archivedPreferred = false } = {}) {
  const activePath = buildPath(uploadId, false);
  if (!archivedPreferred && fs.existsSync(activePath)) {
    return readJsonFile(activePath);
  }
  const archivedPath = buildPath(uploadId, true);
  if (fs.existsSync(archivedPath)) {
    return readJsonFile(archivedPath);
  }
  return null;
}

export function listRawAssets({ includeArchived = true } = {}) {
  const active = fs
    .readdirSync(RAW_ASSETS_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''));

  const archived = includeArchived
    ? fs
        .readdirSync(ARCHIVED_RAW_ASSETS_DIR)
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace(/\.json$/, ''))
    : [];

  return { active, archived };
}

export function archiveRawAsset(uploadId) {
  const source = buildPath(uploadId, false);
  if (!fs.existsSync(source)) {
    return null;
  }
  const target = buildPath(uploadId, true);
  ensureDirectoryExists(path.dirname(target));
  const payload = readJsonFile(source);
  fs.renameSync(source, target);
  return payload;
}
