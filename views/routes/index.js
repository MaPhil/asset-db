import { Router } from 'express';
import {
  redirectToAssetPool,
  redirectAssets,
  renderAssetPool,
  renderRawTable
} from '../controller/assetPool.controller.js';
import {
  renderAssetStructure,
  renderAssetStructureCategory,
  renderAssetStructureGroup,
  renderAssetTypes
} from '../controller/assetStructure.controller.js';
import { renderImplementation } from '../controller/implementation.controller.js';
import { renderMeasures } from '../controller/measures.controller.js';
import { renderSource } from '../controller/sources.controller.js';

const router = Router();

router.get('/', redirectToAssetPool);
router.get('/assets', redirectAssets);
router.get('/asset-pool', renderAssetPool);
router.get('/asset-pool/raw/:id', renderRawTable);
router.get('/asset-structure', renderAssetStructure);
router.get('/asset-structure/categories/:id', renderAssetStructureCategory);
router.get(
  '/asset-structure/categories/:categoryId/groups/:groupId',
  renderAssetStructureGroup
);
router.get('/asset-types', renderAssetTypes);
router.get('/implementation', renderImplementation);
router.get('/measures', renderMeasures);
router.get('/sources/:id', renderSource);

export default router;
