import { Router } from 'express';
import { MappingsController } from '../controllers/index.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

router.post('/schema/add', asyncHandler(MappingsController.addSchemaCol));
router.post('/save', asyncHandler(MappingsController.save));

export default router;
