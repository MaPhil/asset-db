import { Router } from 'express';
import { GroupAssetSelectorsController, GroupsController } from '../controllers/index.js';
import { asyncHandler, validateId } from '../middleware/index.js';
import { store } from '../../../lib/storage.js';
import { logger } from '../../../lib/logger.js';
import { slugify } from '../../../lib/assetStructure.js';

const router = Router();

const resolveGroupBySlug = (req, res, next) => {
  const slug = typeof req.params.groupSlug === 'string' ? req.params.groupSlug.trim() : '';
  if (!slug) {
    logger.warn('Gruppe-Slug fehlt in der Anfrage', { params: req.params });
    return res.status(400).json({ error: 'Ungültiger Gruppenbezeichner.' });
  }
  const groupsTable = store.get('groups');
  const groups = Array.isArray(groupsTable?.rows) ? groupsTable.rows : [];
  const group = groups.find((row) => {
    const candidate = row?.slug || slugify(row?.title || `gruppe-${row?.id}`);
    return candidate === slug;
  });
  if (!group) {
    logger.warn('Gruppe mit Slug nicht gefunden', { slug });
    return res.status(404).json({ error: 'Gruppe nicht gefunden.' });
  }
  req.params.id = group.id;
  req.group = group;
  next();
};

router.get('/', asyncHandler(GroupsController.list));
router.post('/', asyncHandler(GroupsController.create));
router.put('/:groupSlug', resolveGroupBySlug, validateId(), asyncHandler(GroupsController.update));
router.delete('/:groupSlug', resolveGroupBySlug, validateId(), asyncHandler(GroupsController.destroy));
router.post(
  '/:groupSlug/link-category',
  resolveGroupBySlug,
  validateId(),
  asyncHandler(GroupsController.linkCategory)
);
router.get(
  '/:groupSlug/asset-selectors',
  resolveGroupBySlug,
  validateId(),
  asyncHandler(GroupAssetSelectorsController.list)
);
router.post(
  '/:groupSlug/asset-selectors',
  resolveGroupBySlug,
  validateId(),
  asyncHandler(GroupAssetSelectorsController.create)
);
router.put(
  '/:groupSlug/asset-selectors/:selectorId',
  resolveGroupBySlug,
  validateId(),
  validateId('selectorId'),
  asyncHandler(GroupAssetSelectorsController.update)
);
router.get(
  '/:groupSlug/asset-selectors/:selectorId/assets',
  resolveGroupBySlug,
  validateId(),
  validateId('selectorId'),
  asyncHandler(GroupAssetSelectorsController.assets)
);

export default router;
