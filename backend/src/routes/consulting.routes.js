import { Router } from 'express';
import ConsultingController from '../controllers/consulting.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticate);
router.use(requireAuth);

// GET - List consulting engagements
router.get('/', ConsultingController.list);

// POST - Create consulting inquiry
router.post('/', ConsultingController.create);

export default router;