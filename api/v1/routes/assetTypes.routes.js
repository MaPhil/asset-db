import { Router } from 'express';

import { AssetTypesController } from '../controllers/index.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(AssetTypesController.summary));
router.put('/:name', asyncHandler(AssetTypesController.updateDecision));

export default router;
