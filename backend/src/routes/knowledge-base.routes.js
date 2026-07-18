import { Router } from 'express';
import KnowledgeBaseController from '../controllers/knowledge-base.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();
router.use(authenticate, requireAuth, requireRole('admin'));
router.get('/', KnowledgeBaseController.list);
router.post('/', KnowledgeBaseController.upsert);
router.put('/', KnowledgeBaseController.upsert);

export default router;
