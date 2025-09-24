import { Router } from 'express';
import { GroupsController } from '../controllers/index.js';
import { asyncHandler, validateId } from '../middleware/index.js';

const router = Router();

router.get('/', asyncHandler(GroupsController.list));
router.post('/', asyncHandler(GroupsController.create));
router.put('/:id', validateId(), asyncHandler(GroupsController.update));
router.post('/:id/link-category', validateId(), asyncHandler(GroupsController.linkCategory));

export default router;
