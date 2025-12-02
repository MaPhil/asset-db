import { Router } from 'express';

import { RawTablesController } from '../controllers/index.js';
import { asyncHandler, validateId } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(RawTablesController.list));
router.get('/:id', validateId(), asyncHandler(RawTablesController.detail));
router.post('/preview', asyncHandler(RawTablesController.preview));
router.post('/import', asyncHandler(RawTablesController.import));
router.patch('/:id', validateId(), asyncHandler(RawTablesController.updateDetails));
router.patch('/:id/mapping', validateId(), asyncHandler(RawTablesController.updateMapping));
router.post('/:id/archive', validateId(), asyncHandler(RawTablesController.archive));
router.delete('/:id', validateId(), asyncHandler(RawTablesController.delete));

export default router;
