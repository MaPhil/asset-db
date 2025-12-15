import { Router } from 'express';
import { CategoriesController } from '../controllers/index.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

router.post('/', asyncHandler(CategoriesController.create));

export default router;
