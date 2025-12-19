import { Router } from 'express';
import { BackupController } from '../controllers/index.js';

const router = Router();

router.get('/download', (req, res) => BackupController.download(req, res));

export default router;
