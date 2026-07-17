import { Router } from 'express';
import MarketInsightsController from '../controllers/market-insights.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';
import { requireSubscriptionFeature } from '../lib/subscription-access.js';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(requireAuth);

// GET - Dashboard data
router.get('/', MarketInsightsController.getDashboard);

router.get('/reports', MarketInsightsController.listResearchReports);

router.post('/research/stream', requireSubscriptionFeature('marketInsights', { ai: true, aiFeature: 'market_trends' }), MarketInsightsController.streamResearch);

// POST - Generate report
router.post('/', MarketInsightsController.generateReport);

// PATCH - Update bookmark/favorite
router.patch('/', MarketInsightsController.updateReport);

// DELETE - Remove report
router.delete('/', MarketInsightsController.deleteReport);

export default router;
