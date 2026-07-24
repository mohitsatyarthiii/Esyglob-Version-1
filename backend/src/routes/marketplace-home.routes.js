import { Router } from 'express';
import { statistics } from '../controllers/marketplace-home.controller.js';

const router = Router();
router.get('/statistics', statistics);
export default router;
