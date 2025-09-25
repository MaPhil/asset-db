import { Router } from 'express';

import { AssetPoolController } from '../controllers/index.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(AssetPoolController.view));
router.delete('/fields/:field', asyncHandler(AssetPoolController.removeField));

export default router;
