import { Router } from 'express';
import { ReportsController } from '../controllers/index.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

router.get('/abdeckung', asyncHandler(ReportsController.fetchAbdeckungReport));
router.post('/abdeckung', asyncHandler(ReportsController.calculateAbdeckungReport));
router.get('/abdeckung/unmatched', asyncHandler(ReportsController.fetchAbdeckungUnmatched));

export default router;
