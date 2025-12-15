import { Router } from 'express';
import categoriesRouter from './categories.routes.js';
import groupsRouter from './groups.routes.js';
import rawTablesRouter from './rawTables.routes.js';
import assetPoolRouter from './assetPool.routes.js';
import assetSubCategoriesRouter from './assetSubCategories.routes.js';
import measuresRouter from './measures.routes.js';
import manipulatorsRouter from './manipulators.routes.js';

const router = Router();

router.use('/categories', categoriesRouter);
router.use('/groups', groupsRouter);
router.use('/raw-tables', rawTablesRouter);
router.use('/asset-pool', assetPoolRouter);
router.use('/asset-sub-categories', assetSubCategoriesRouter);
router.use('/measures', measuresRouter);
router.use('/manipulators', manipulatorsRouter);

export default router;
