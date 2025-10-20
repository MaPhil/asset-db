import { Router } from 'express';

import { AssetPoolController } from '../controllers/index.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(AssetPoolController.view));
router.post('/fields', asyncHandler(AssetPoolController.addField));
router.delete('/fields/:field', asyncHandler(AssetPoolController.removeField));
router.put(
  '/fields/:field/editable',
  asyncHandler(AssetPoolController.updateFieldEditable)
);
router.put(
  '/rows/:rowId/fields/:field',
  asyncHandler(AssetPoolController.updateFieldValue)
);
router.get(
  '/settings/asset-type-field',
  asyncHandler(AssetPoolController.getAssetTypeField)
);
router.put(
  '/settings/asset-type-field',
  asyncHandler(AssetPoolController.updateAssetTypeField)
);

export default router;
