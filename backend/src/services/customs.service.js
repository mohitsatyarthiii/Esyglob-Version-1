import CustomsRepository from '../repositories/customs.repository.js';
import NotificationService from './notification.service.js';
import {
  customsCreateSchema,
  customsPatchSchema,
  CUSTOMS_TYPES,
  CUSTOMS_STATUSES,
  toPositiveInt,
} from '../validators/customs.validator.js';

class CustomsService {
  /**
   * List customs clearances
   */
  static async listClearances(userId, roles, query = {}) {
    const { status, type, page: rawPage, limit: rawLimit } = query;
    const page = toPositiveInt(rawPage, 1);
    const limit = toPositiveInt(rawLimit, 10, 50);

    const dbQuery = {};

    if (!roles?.includes('admin')) {
      dbQuery.userId = userId;
    }

    if (status && status !== 'all' && CUSTOMS_STATUSES.includes(status)) {
      dbQuery.status = status;
    }
    if (type && CUSTOMS_TYPES.includes(type)) {
      dbQuery.type = type;
    }

    return CustomsRepository.findWithPagination(dbQuery, { page, limit });
  }

  /**
   * Create customs clearance request
   */
  static async createClearance(userId, data) {
    // Validate
    const parsed = customsCreateSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(
        new Error('Missing required fields: type, originCountry, destinationCountry, products'),
        { statusCode: 400 }
      );
    }

    const {
      type, shipmentId, carrier, trackingNumber,
      originCountry, destinationCountry, portOfLoading, portOfDischarge,
      products, documents,
    } = parsed.data;

    // Validate shipmentId if provided
    if (shipmentId && !CustomsRepository.isValidId(shipmentId)) {
      throw Object.assign(
        new Error('Invalid shipment ID'),
        { statusCode: 400 }
      );
    }

    // Normalize products
    const normalizedProducts = products.map(product => ({
      ...product,
      quantity: Number(product.quantity || 0),
      unitValue: Number(product.unitValue || 0),
      totalValue: Number(product.totalValue || 0),
    }));

    // Calculate values
    const cifValue = normalizedProducts.reduce((sum, p) => sum + p.totalValue, 0);
    const fobValue = Math.round(cifValue * 0.9 * 100) / 100;

    // Calculate duties (Indian customs example)
    const basicCustomsDuty = Math.round(cifValue * 0.10 * 100) / 100;
    const additionalDuty = Math.round(basicCustomsDuty * 0.10 * 100) / 100;
    const socialWelfareSurcharge = Math.round(basicCustomsDuty * 0.10 * 100) / 100;
    const igst = Math.round((cifValue + basicCustomsDuty + socialWelfareSurcharge) * 0.18 * 100) / 100;
    const totalDuties = Math.round(
      (basicCustomsDuty + additionalDuty + socialWelfareSurcharge + igst) * 100
    ) / 100;

    // Calculate per-product duties
    const productsWithDuties = normalizedProducts.map(product => ({
      ...product,
      calculatedDuty: Math.round(
        ((product.totalValue * 0.10) + ((product.totalValue * 1.10) * 0.18)) * 100
      ) / 100,
    }));

    // Create clearance
    const clearance = await CustomsRepository.create({
      userId,
      type,
      shipmentId: shipmentId || null,
      carrier,
      trackingNumber,
      originCountry,
      destinationCountry,
      portOfLoading,
      portOfDischarge,
      products: productsWithDuties,
      cifValue,
      fobValue,
      basicCustomsDuty,
      additionalDuty,
      socialWelfareSurcharge,
      igst,
      totalDuties,
      documents: documents || [],
      status: 'submitted',
    });

    // Update related shipping order
    if (shipmentId) {
      await CustomsRepository.updateShippingOrder(shipmentId);
    }

    // Notify
    await NotificationService.createNotification({
      userId,
      notificationType: 'customs_submitted',
      title: 'Customs Clearance Request Submitted',
      description: `Clearance request ${clearance.clearanceNumber} for ${type} has been submitted. Estimated duties: USD ${totalDuties.toFixed(2)}`,
      data: {
        relatedId: clearance._id,
        relatedModel: 'CustomsClearance',
        actionUrl: `/dashboard/buyer/customs/${clearance._id}`,
      },
      priority: 'high',
    }).catch(err => console.error('Customs notification error:', err));

    return { clearance, message: 'Customs clearance request submitted successfully' };
  }

  /**
   * Get single clearance detail
   */
  static async getClearance(userId, roles, clearanceId) {
    const query = { _id: clearanceId };
    if (!roles?.includes('admin')) {
      query.userId = userId;
    }

    const clearance = await CustomsRepository.findOne(query);
    if (!clearance) {
      throw Object.assign(new Error('Customs clearance not found'), { statusCode: 404 });
    }

    return { clearance };
  }

  /**
   * Update clearance
   */
  static async updateClearance(userId, roles, clearanceId, data) {
    // Validate
    const parsed = customsPatchSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(new Error('Invalid update data'), { statusCode: 400 });
    }

    const query = { _id: clearanceId };
    if (!roles?.includes('admin')) {
      query.userId = userId;
    }

    const clearance = await CustomsRepository.findOneAndUpdate(query, parsed.data);
    if (!clearance) {
      throw Object.assign(new Error('Customs clearance not found'), { statusCode: 404 });
    }

    return { clearance };
  }
}

export default CustomsService;