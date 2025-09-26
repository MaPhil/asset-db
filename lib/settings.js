import { store } from './storage.js';

const TABLE = 'settings';

export function getSetting(key) {
  if (!key) {
    return null;
  }
  const data = store.get(TABLE);
  const entry = data.rows.find((row) => row.key === key);
  return entry?.value ?? null;
}

export function setSetting(key, value) {
  if (!key) {
    throw new Error('Setting key is required');
  }
  const data = store.get(TABLE);
  const entry = data.rows.find((row) => row.key === key);
  if (entry) {
    store.update(TABLE, entry.id, { value });
    return { id: entry.id, key, value };
  }
  const id = store.insert(TABLE, { key, value });
  return { id, key, value };
}

export function removeSetting(key) {
  if (!key) {
    return;
  }
  const data = store.get(TABLE);
  const entry = data.rows.find((row) => row.key === key);
  if (entry) {
    store.remove(TABLE, entry.id);
  }
}
