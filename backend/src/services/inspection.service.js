import InspectionRepository from '../repositories/inspection.repository.js';
import NotificationService from './notification.service.js';
import {
  inspectionCreateSchema,
  inspectionPatchSchema,
  INSPECTION_TYPES,
  INSPECTION_STATUSES,
  toPositiveInt,
} from '../validators/inspection.validator.js';

// Fee mapping by inspection type
const FEE_MAP = {
  pre_shipment: 300,
  during_production: 350,
  container_loading: 200,
  lab_testing: 500,
};

class InspectionService {
  /**
   * List inspections
   */
  static async listInspections(userId, roles, query = {}) {
    const { status, type, page: rawPage, limit: rawLimit } = query;
    const page = toPositiveInt(rawPage, 1);
    const limit = toPositiveInt(rawLimit, 10, 50);

    const dbQuery = {};

    // Non-admin users only see their own inspections
    if (!roles?.includes('admin')) {
      dbQuery.userId = userId;
    }

    if (status && status !== 'all' && INSPECTION_STATUSES.includes(status)) {
      dbQuery.status = status;
    }
    if (type && INSPECTION_TYPES.includes(type)) {
      dbQuery.type = type;
    }

    return InspectionRepository.findWithPagination(dbQuery, { page, limit });
  }

  /**
   * Create inspection request
   */
  static async createInspection(userId, data) {
    // Validate
    const parsed = inspectionCreateSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(
        new Error('Missing required fields: type, factory address, products'),
        { statusCode: 400 }
      );
    }

    const {
      type, supplierName, factoryName, factoryAddress,
      contactPerson, contactPhone, contactEmail, products,
      requestedDate, standard, specialRequirements,
    } = parsed.data;

    // Normalize products
    const normalizedProducts = products.map(product => ({
      ...product,
      quantity: Number(product.quantity || 0),
    }));

    const totalQuantity = normalizedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const fee = FEE_MAP[type] || 300;

    // Create inspection
    const inspection = await InspectionRepository.create({
      userId,
      type,
      supplierName,
      factoryName,
      factoryAddress,
      contactPerson,
      contactPhone,
      contactEmail,
      products: normalizedProducts,
      totalQuantity,
      requestedDate: requestedDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      standard: standard || 'AQL 2.5',
      specialRequirements,
      inspectionFee: fee,
      totalCost: fee,
      status: 'pending',
    });

    // Notify user
    await NotificationService.createNotification({
      userId,
      notificationType: 'inspection_scheduled',
      title: 'Inspection Requested',
      description: `Inspection ${inspection.inspectionNumber} for ${totalQuantity} units has been submitted.`,
      data: {
        relatedId: inspection._id,
        relatedModel: 'QualityInspection',
        actionUrl: `/dashboard/buyer/quality-inspection/${inspection._id}`,
      },
      priority: 'medium',
    }).catch(err => console.error('Inspection notification error:', err));

    return { inspection, message: 'Inspection request created successfully' };
  }

  /**
   * Get single inspection detail
   */
  static async getInspection(userId, roles, inspectionId) {
    const query = { _id: inspectionId };
    if (!roles?.includes('admin')) {
      query.userId = userId;
    }

    const inspection = await InspectionRepository.findOne(query);
    if (!inspection) {
      throw Object.assign(new Error('Inspection not found'), { statusCode: 404 });
    }

    return { inspection };
  }

  /**
   * Update inspection
   */
  static async updateInspection(userId, roles, inspectionId, data) {
    // Validate
    const parsed = inspectionPatchSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(new Error('Invalid update data'), { statusCode: 400 });
    }

    const query = { _id: inspectionId };
    if (!roles?.includes('admin')) {
      query.userId = userId;
    }

    const inspection = await InspectionRepository.findOneAndUpdate(query, parsed.data);
    if (!inspection) {
      throw Object.assign(new Error('Inspection not found'), { statusCode: 404 });
    }

    return { inspection };
  }
}

export default InspectionService;