import FinancingRepository from '../repositories/financing.repository.js';
import NotificationService from './notification.service.js';
import {
  financingCreateSchema,
  financingPatchSchema,
  FINANCING_TYPES,
  FINANCING_STATUSES,
  toPositiveInt,
} from '../validators/financing.validator.js';

// Interest rate mapping by financing type (monthly rates)
const RATE_MAP = {
  po_financing: 0.015,    // 1.5% per month
  invoice_factoring: 0.02, // 2% per month
  supply_chain: 0.008,    // 0.8% per month
  working_capital: 0.03,  // 3% per month
};

class FinancingService {
  /**
   * List financing applications
   */
  static async listApplications(userId, roles, query = {}) {
    const { status, type, page: rawPage, limit: rawLimit } = query;
    const page = toPositiveInt(rawPage, 1);
    const limit = toPositiveInt(rawLimit, 10, 50);

    const dbQuery = {};

    // Non-admin users only see their own applications
    if (!roles?.includes('admin')) {
      dbQuery.userId = userId;
    }

    if (status && status !== 'all' && FINANCING_STATUSES.includes(status)) {
      dbQuery.status = status;
    }
    if (type && FINANCING_TYPES.includes(type)) {
      dbQuery.type = type;
    }

    return FinancingRepository.findWithPagination(dbQuery, { page, limit });
  }

  /**
   * Create financing application
   */
  static async createApplication(userId, data) {
    // Validate
    const parsed = financingCreateSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(
        new Error('Missing required fields: type, requestedAmount'),
        { statusCode: 400 }
      );
    }

    const {
      type, requestedAmount, currency, termDays,
      purchaseOrder, invoices, supplierId, documents, bankAccount,
    } = parsed.data;

    // Type-specific validation
    if (type === 'po_financing' && !purchaseOrder) {
      throw Object.assign(
        new Error('Purchase order details required for PO financing'),
        { statusCode: 400 }
      );
    }
    if (type === 'invoice_factoring' && (!invoices || !invoices.length)) {
      throw Object.assign(
        new Error('Invoices required for invoice factoring'),
        { statusCode: 400 }
      );
    }

    // Calculate financials
    const amount = Number(requestedAmount);
    const term = Number(termDays || 90);
    const interestRate = RATE_MAP[type] || 0.02;
    const processingFee = Math.round(amount * 0.01 * 100) / 100; // 1% processing fee

    // Build repayment schedule
    const repaymentSchedule = [];
    const monthsCount = Math.ceil(term / 30);
    const monthlyAmount = Math.round((amount / monthsCount) * 100) / 100;

    for (let i = 1; i <= monthsCount; i++) {
      repaymentSchedule.push({
        dueDate: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000),
        amount: monthlyAmount,
        status: 'pending',
      });
    }

    // Create application
    const application = await FinancingRepository.create({
      userId,
      type,
      requestedAmount: amount,
      currency: currency || 'USD',
      termDays: term,
      interestRate,
      processingFee,
      purchaseOrder,
      invoices,
      supplierId,
      documents,
      bankAccount,
      repaymentSchedule,
      status: 'submitted',
    });

    // Notify
    await NotificationService.createNotification({
      userId,
      notificationType: 'financing_applied',
      title: 'Financing Application Submitted',
      description: `Your ${type.replace('_', ' ')} application for ${currency} ${requestedAmount} has been submitted.`,
      data: {
        relatedId: application._id,
        relatedModel: 'TradeFinancing',
        actionUrl: `/dashboard/buyer/financing/${application._id}`,
      },
      priority: 'high',
    }).catch(err => console.error('Financing notification error:', err));

    return { application, message: 'Financing application submitted successfully' };
  }

  /**
   * Get single application detail
   */
  static async getApplication(userId, roles, applicationId) {
    const query = { _id: applicationId };
    if (!roles?.includes('admin')) {
      query.userId = userId;
    }

    const application = await FinancingRepository.findOne(query);
    if (!application) {
      throw Object.assign(new Error('Financing application not found'), { statusCode: 404 });
    }

    return { application };
  }

  /**
   * Update application
   */
  static async updateApplication(userId, roles, applicationId, data) {
    // Validate
    const parsed = financingPatchSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(new Error('Invalid update data'), { statusCode: 400 });
    }

    const query = { _id: applicationId };
    if (!roles?.includes('admin')) {
      query.userId = userId;
    }

    const application = await FinancingRepository.findOneAndUpdate(query, parsed.data);
    if (!application) {
      throw Object.assign(new Error('Financing application not found'), { statusCode: 404 });
    }

    return { application };
  }
}

export default FinancingService;