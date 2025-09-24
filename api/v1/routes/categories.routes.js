import { Router } from 'express';
import { CategoriesController } from '../controllers/index.js';
import { asyncHandler, validateId } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(CategoriesController.list));
router.post('/', asyncHandler(CategoriesController.create));
router.get('/:id', validateId(), asyncHandler(CategoriesController.get));
router.put('/:id', validateId(), asyncHandler(CategoriesController.update));

export default router;
