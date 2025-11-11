import { Router } from 'express';
import { GroupAssetSelectorsController, GroupsController } from '../controllers/index.js';
import { asyncHandler, validateId } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(GroupsController.list));
router.post('/', asyncHandler(GroupsController.create));
router.put('/:id', validateId(), asyncHandler(GroupsController.update));
router.delete('/:id', validateId(), asyncHandler(GroupsController.destroy));
router.post('/:id/link-category', validateId(), asyncHandler(GroupsController.linkCategory));
router.get(
  '/:id/asset-selectors',
  validateId(),
  asyncHandler(GroupAssetSelectorsController.list)
);
router.post(
  '/:id/asset-selectors',
  validateId(),
  asyncHandler(GroupAssetSelectorsController.create)
);
router.put(
  '/:id/asset-selectors/:selectorId',
  validateId(),
  validateId('selectorId'),
  asyncHandler(GroupAssetSelectorsController.update)
);
router.get(
  '/:id/asset-selectors/:selectorId/assets',
  validateId(),
  validateId('selectorId'),
  asyncHandler(GroupAssetSelectorsController.assets)
);

export default router;
