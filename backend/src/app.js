import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { config } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import supplierRoutes from './routes/supplier.routes.js';
import productRoutes from './routes/product.routes.js';
import bulkImportRoutes from './routes/bulk-import.routes.js';
import categoryRoutes from './routes/category.routes.js';
import chatRoutes from './routes/chat.routes.js';
import contactRoutes from './routes/contact.routes.js';
import rfqRoutes from './routes/rfq.routes.js';
import quotationRoutes from './routes/quotation.routes.js';
import checkoutRoutes from './routes/checkout.routes.js';
import aiChatRoutes from './routes/ai-chat.routes.js';
import marketInsightsRoutes from './routes/market-insights.routes.js';
import aiSearchRoutes from './routes/ai-search.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import reviewRoutes from './routes/review.routes.js';
import sampleOrderRoutes from './routes/sample-order.routes.js';
import addressRoutes from './routes/address.routes.js';
import orderRoutes from './routes/order.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import profileRoutes from './routes/profile.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import shipmentRoutes from './routes/shipment.routes.js';
import shippingRoutes from './routes/shipping.routes.js';
import globalSearchRoutes from './routes/global-search.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import inspectionRoutes from './routes/inspection.routes.js';
import financingRoutes from './routes/financing.routes.js';
import escrowRoutes from './routes/escrow.routes.js';
import disputeRoutes from './routes/dispute.routes.js';
import customsRoutes from './routes/customs.routes.js';
import contactLeadRoutes from './routes/contact-lead.routes.js';
import consultingRoutes from './routes/consulting.routes.js';
import buyerActivityRoutes from './routes/buyer-activity.routes.js';
import supportTicketRoutes from './routes/support-ticket.routes.js';
import serviceRequestRoutes from './routes/service-request.routes.js';
import warehouseRoutes from './routes/warehouse.routes.js';
import locationRoutes from './routes/location.routes.js';
import documentRoutes from './routes/document.routes.js';
import hsCodeRoutes from './routes/hs-code.routes.js';
import knowledgeBaseRoutes from './routes/knowledge-base.routes.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

// CORS configuration
app.use(cors({
  origin(origin, callback) {
    if (config.corsOrigin === true || !origin) return callback(null, true);
    if (Array.isArray(config.corsOrigin) && config.corsOrigin.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 600,
}));

// Body parsing
app.use(express.json({ limit: config.jsonLimit, verify: (req, _res, buffer) => { req.rawBody = buffer; } }));
app.use(express.urlencoded({ extended: true, limit: config.formLimit }));
app.use(cookieParser());

// ✅ FIX: Lightweight auth — sets req.user ONLY if token exists, NO DB query
// authenticate should ONLY decode JWT, NOT query DB
// Health check (NO auth needed)
app.get('/api/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        status: 'ok',
        mongodb: mongoose.connection.readyState,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// ✅ PUBLIC ROUTES — No additional auth middleware
// These already handle auth internally or are fully public
// ============================================================
app.use('/api/products', productRoutes);           // Public listing + protected CRUD
app.use('/api/categories', categoryRoutes);        // Public
app.use('/api/hs-codes', hsCodeRoutes);            // Public classification search
app.use('/api/suppliers', supplierRoutes);         // Public listing
app.use('/api/search', globalSearchRoutes);        // Public search
app.use('/api/rfqs', rfqRoutes);                   // Public listing + protected actions
app.use('/api/contact', contactLeadRoutes);        // Public contact form

// ============================================================
// PROTECTED ROUTES — Add auth middleware here if not in route files
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/products/bulk', bulkImportRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai-chat', aiChatRoutes);
app.use('/api/messenger/contacts', contactRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/market-insights', marketInsightsRoutes);
app.use('/api/ai-search', aiSearchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/orders/sample', sampleOrderRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/inspections', inspectionRoutes);
app.use('/api/financing', financingRoutes);
app.use('/api/escrow', escrowRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/customs', customsRoutes);
app.use('/api/consulting', consultingRoutes);
app.use('/api/buyer', buyerActivityRoutes);
app.use('/api/support-tickets', supportTicketRoutes);
app.use('/api/service-requests', serviceRequestRoutes);
app.use('/api/warehousing', warehouseRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/admin/knowledge-base', knowledgeBaseRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

export default app;
