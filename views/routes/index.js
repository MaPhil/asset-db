import { Router } from 'express';
import {
  redirectToAssetPool,
  redirectAssets,
  renderAssetPool,
  renderRawTable
} from '../controller/assetPool.controller.js';
import {
  renderAssetStructure,
  renderAssetStructureAssetSubCategory,
  renderAssetStructureGroup,
  renderAssetStructureSubTopic,
  renderAssetStructureTopic
} from '../controller/assetStructure.controller.js';
import { renderImplementation } from '../controller/implementation.controller.js';
import { renderMeasures } from '../controller/measures.controller.js';
import { renderSource } from '../controller/sources.controller.js';
import {
  redirectToAbdeckungReport,
  renderAbdeckungReport
} from '../controller/reports.controller.js';

const router = Router();

router.get('/', redirectToAssetPool);
router.get('/reports', redirectToAbdeckungReport);
router.get('/reports/abdeckung', renderAbdeckungReport);
router.get('/assets', redirectAssets);
router.get('/asset-pool', renderAssetPool);
router.get('/asset-pool/raw/:id', renderRawTable);
router.get('/asset-structure', renderAssetStructure);
router.get(
  '/asset-structure/:topicId/:subTopicId/:assetSubCategorySlug/groups/:groupSlug',
  renderAssetStructureGroup
);
router.get(
  '/asset-structure/:topicId/:subTopicId/:assetSubCategorySlug',
  renderAssetStructureAssetSubCategory
);
router.get('/asset-structure/:topicId/:subTopicId', renderAssetStructureSubTopic);
router.get('/asset-structure/:topicId', renderAssetStructureTopic);
router.get('/implementation', renderImplementation);
router.get('/measures', renderMeasures);
router.get('/sources/:id', renderSource);

export default router;
