import { Router } from 'express';

import { SourcesController } from '../controllers/index.js';
import { asyncHandler, validateId } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(SourcesController.list));
router.get('/:id', validateId(), asyncHandler(SourcesController.get));
router.get('/:id/headers', validateId(), asyncHandler(SourcesController.headers));
router.post('/upload', asyncHandler(SourcesController.upload));
router.delete('/:id', validateId(), asyncHandler(SourcesController.remove));

export default router;
