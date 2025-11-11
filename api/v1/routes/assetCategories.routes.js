import { Router } from 'express';
import { AssetCategoriesController } from '../controllers/index.js';
import { asyncHandler, validateId } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(AssetCategoriesController.summary));
router.post('/', asyncHandler(AssetCategoriesController.create));
router.put('/:id', validateId(), asyncHandler(AssetCategoriesController.update));
router.delete('/:id', validateId(), asyncHandler(AssetCategoriesController.delete));

export default router;
