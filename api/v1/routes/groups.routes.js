import { Router } from 'express';
import { GroupAssetTypesController, GroupsController } from '../controllers/index.js';
import { asyncHandler, validateId } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(GroupsController.list));
router.post('/', asyncHandler(GroupsController.create));
router.put('/:id', validateId(), asyncHandler(GroupsController.update));
router.post('/:id/link-category', validateId(), asyncHandler(GroupsController.linkCategory));
router.get(
  '/:id/asset-types',
  validateId(),
  asyncHandler(GroupAssetTypesController.list)
);
router.get(
  '/:id/asset-types/available',
  validateId(),
  asyncHandler(GroupAssetTypesController.available)
);
router.post(
  '/:id/asset-types',
  validateId(),
  asyncHandler(GroupAssetTypesController.create)
);
router.delete(
  '/:id/asset-types/:assetTypeId',
  validateId(),
  validateId('assetTypeId'),
  asyncHandler(GroupAssetTypesController.destroy)
);

export default router;
