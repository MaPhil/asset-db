import { Router } from 'express';

import { MeasuresController } from '../controllers/MeasuresController.js';

const router = Router();

router.get('/', MeasuresController.list);
router.post('/upload', MeasuresController.upload);

export default router;

