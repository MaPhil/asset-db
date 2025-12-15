import { Router } from 'express';
import { AssetSubCategoriesController } from '../controllers/index.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(AssetSubCategoriesController.list));
router.patch('/:slug', asyncHandler(AssetSubCategoriesController.update));

export default router;
