import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const PREVIEW_DIR = path.join(process.cwd(), 'uploads', 'previews');

export function ensurePreviewDir() {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

export function createPreview(payload) {
  ensurePreviewDir();
  const id = randomUUID();
  const filePath = path.join(PREVIEW_DIR, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return { id, filePath };
}

export function readPreview(id) {
  ensurePreviewDir();
  const filePath = path.join(PREVIEW_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function deletePreview(id) {
  ensurePreviewDir();
  const filePath = path.join(PREVIEW_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
