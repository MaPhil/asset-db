import { Router } from 'express';
import assetsRouter from './assets.routes.js';
import sourcesRouter from './sources.routes.js';
import mappingsRouter from './mappings.routes.js';
import categoriesRouter from './categories.routes.js';
import groupsRouter from './groups.routes.js';
import rawTablesRouter from './rawTables.routes.js';
import assetPoolRouter from './assetPool.routes.js';
import measuresRouter from './measures.routes.js';
import assetCategoriesRouter from './assetCategories.routes.js';
import manipulatorsRouter from './manipulators.routes.js';

const router = Router();

router.use('/assets', assetsRouter);
router.use('/sources', sourcesRouter);
router.use('/mappings', mappingsRouter);
router.use('/categories', categoriesRouter);
router.use('/groups', groupsRouter);
router.use('/raw-tables', rawTablesRouter);
router.use('/asset-pool', assetPoolRouter);
router.use('/asset-categories', assetCategoriesRouter);
router.use('/measures', measuresRouter);
router.use('/manipulators', manipulatorsRouter);

export default router;
