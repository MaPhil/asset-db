import { Router } from 'express';
import { ManipulatorsController } from '../controllers/index.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(ManipulatorsController.list));
router.post('/', asyncHandler(ManipulatorsController.create));

export default router;
