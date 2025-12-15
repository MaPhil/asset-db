import { store } from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';

export const CategoriesController = {
  create: (req, res) => {
    const {
      title,
      name,
      governing_category,
      owner,
      group_owner,
      integrity,
      availability,
      confidentiality,
      description
    } = req.body;

    const providedName =
      typeof name === 'string' ? name.trim() : name != null ? String(name).trim() : '';
    const normalisedTitle = (title ?? providedName ?? '').toString().trim();
    const resolvedName = providedName || normalisedTitle || undefined;
    const payload = {
      title: normalisedTitle || undefined,
      name: resolvedName,
      governing_category: governing_category ? String(governing_category).trim() : undefined,
      owner: owner ? String(owner).trim() : undefined,
      group_owner: group_owner ? String(group_owner).trim() : owner ? String(owner).trim() : undefined,
      integrity: integrity ? String(integrity).trim() : undefined,
      availability: availability ? String(availability).trim() : undefined,
      confidentiality: confidentiality ? String(confidentiality).trim() : undefined,
      description: description ? String(description).trim() : undefined
    };

    const sanitized = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    );

    logger.info('Kategorie wird erstellt', sanitized);
    const id = store.insert('categories', sanitized);
    logger.info('Kategorie erstellt', { categoryId: id });
    res.json({ ok: true, id });
  }
};
