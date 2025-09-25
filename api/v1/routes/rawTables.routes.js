import { Router } from 'express';
import multer from 'multer';
import path from 'path';

import { RawTablesController } from '../controllers/index.js';
import { asyncHandler, validateId } from '../middleware/index.js';

const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

const router = Router();

router.get('/', asyncHandler(RawTablesController.list));
router.get('/:id', validateId(), asyncHandler(RawTablesController.detail));
router.post('/preview', upload.single('file'), asyncHandler(RawTablesController.preview));
router.post('/import', asyncHandler(RawTablesController.import));
router.patch('/:id/mapping', validateId(), asyncHandler(RawTablesController.updateMapping));

export default router;
