import { Router } from 'express';
import { AssetsController } from '../controllers/index.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(AssetsController.list));
router.post('/rebuild', asyncHandler(AssetsController.rebuild));

export default router;
