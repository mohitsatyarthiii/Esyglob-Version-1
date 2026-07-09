import { Router } from 'express';
import GlobalSearchController from '../controllers/global-search.controller.js';

const router = Router();

// Public route - no authentication required
// GET - Global marketplace search
router.get('/', GlobalSearchController.search);

export default router;