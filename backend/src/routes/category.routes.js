import { Router } from 'express';
import * as categoryController from '../controllers/category.controller.js';

const router = Router();

// GET /api/categories - Public category listing
router.get('/', categoryController.getCategories);

export default router;