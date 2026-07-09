import { Router } from 'express';
import * as categoryController from '../controllers/category.controller.js';

const router = Router();

// GET /api/categories - Public category listing
router.get('/', categoryController.getCategories);

// GET /api/categories/:categoryIdOrSlug - Public category detail
router.get('/:categoryIdOrSlug', categoryController.getCategory);

export default router;
