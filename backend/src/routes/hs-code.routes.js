import { Router } from 'express';
import * as controller from '../controllers/hs-code.controller.js';

const router = Router();
router.get('/search', controller.search);
router.get('/:code', controller.getByCode);
export default router;
