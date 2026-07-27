import { Router } from 'express';
import mongoose from 'mongoose';
import * as controller from '../controllers/admin.controller.js';
import { authenticate, requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { requireAdminPermission, requireAdminResourcePermission } from '../middlewares/admin-permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { adminActionSchema, adminMutationSchema, documentReviewSchema } from '../validators/admin.validator.js';

const router = Router();
router.use(authenticate, requireAuth, requireRole('admin'));
router.get('/overview', requireAdminPermission('dashboard:view'), controller.overview);
router.get('/:resource', requireAdminResourcePermission('view'), controller.list);
router.post('/:resource', requireAdminResourcePermission('manage'), validate(adminMutationSchema), controller.create);
router.get('/:resource/:id', requireAdminResourcePermission('view'), validId('id'), controller.get);
router.patch('/:resource/:id', requireAdminResourcePermission('manage'), validId('id'), validate(adminMutationSchema), controller.update);
router.post('/verifications/:id/documents/:documentId/review', requireAdminPermission('verifications:manage'), validId('id'), validId('documentId'), validate(documentReviewSchema), controller.reviewDocument);
router.post('/:resource/:id/actions', requireAdminResourcePermission('manage'), validId('id'), validate(adminActionSchema), controller.action);
router.delete('/:resource/:id', requireAdminResourcePermission('manage'), validId('id'), controller.remove);

function validId(parameter) {
  return (req, res, next) => mongoose.Types.ObjectId.isValid(req.params[parameter])
    ? next()
    : res.status(422).json({ error: `Invalid ${parameter}`, code: 'INVALID_IDENTIFIER' });
}

export default router;
