import { Router } from 'express';
import assetsRouter from './assets.routes.js';
import sourcesRouter from './sources.routes.js';
import mappingsRouter from './mappings.routes.js';
import categoriesRouter from './categories.routes.js';
import groupsRouter from './groups.routes.js';

const router = Router();

router.use('/assets', assetsRouter);
router.use('/sources', sourcesRouter);
router.use('/mappings', mappingsRouter);
router.use('/categories', categoriesRouter);
router.use('/groups', groupsRouter);

export default router;
