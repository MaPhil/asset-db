import { Router } from 'express';
import multer from 'multer';
import path from 'path';

import { SourcesController } from '../controllers/index.js';
import { asyncHandler, validateId } from '../middleware/index.js';

const upload = multer({ dest: path.join(process.cwd(), 'uploads') });
const router = Router();

router.get('/', asyncHandler(SourcesController.list));
router.get('/:id', validateId(), asyncHandler(SourcesController.get));
router.get('/:id/headers', validateId(), asyncHandler(SourcesController.headers));
router.post('/upload', upload.single('file'), asyncHandler(SourcesController.upload));
router.delete('/:id', validateId(), asyncHandler(SourcesController.remove));

export default router;
