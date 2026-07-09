import { Router } from 'express';
import ProductController from '../controllers/product.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for public routes
const publicLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 50, // 50 requests per second
  message: 'Too many requests, please try again later.',
});

// ===== PUBLIC ROUTES =====

// GET /api/products - Public listing (optimized for speed)
router.get('/', publicLimiter, ProductController.getProducts);

// GET /api/products/:productId - Product detail
router.get('/:productId', publicLimiter, ProductController.getProductDetail);

// ===== PROTECTED ROUTES (SELLER ONLY) =====

// POST /api/products - Create product
router.post(
  '/',
  authenticate,
  requireAuth,
  requireRole('seller'),
  ProductController.createProduct
);

// PATCH /api/products/:productId - Update product
router.patch(
  '/:productId',
  authenticate,
  requireAuth,
  ProductController.updateProduct
);

// DELETE /api/products/:productId - Delete product
router.delete(
  '/:productId',
  authenticate,
  requireAuth,
  ProductController.deleteProduct
);

export default router;