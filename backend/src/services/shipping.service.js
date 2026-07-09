import ShippingRepository from '../repositories/shipping.repository.js';
import NotificationService from './notification.service.js';
import { shippingCreateSchema, shipmentActionSchema } from '../validators/shipping.validator.js';
import { SHIPPING_TYPES, SHIPPING_STATUSES, toPositiveInt } from '../validators/shipping.validator.js';

class ShippingService {
  /**
   * List shipping orders
   */
  static async listShipments(userId, roles, query = {}) {
    const { status, type, page: rawPage, limit: rawLimit } = query;
    const page = toPositiveInt(rawPage, 1);
    const limit = toPositiveInt(rawLimit, 10, 50);

    const dbQuery = {};

    // Non-admin users only see their own shipments
    if (!roles?.includes('admin')) {
      dbQuery.userId = userId;
    }

    if (status && status !== 'all' && SHIPPING_STATUSES.includes(status)) {
      dbQuery.status = status;
    }
    if (type && SHIPPING_TYPES.includes(type)) {
      dbQuery.type = type;
    }

    return ShippingRepository.findWithPagination(dbQuery, { page, limit });
  }

  /**
   * Get single shipment
   */
  static async getShipment(userId, roles, shipmentId) {
    const shipment = await ShippingRepository.findByIdLean(shipmentId);

    if (!shipment) {
      throw Object.assign(new Error('Shipment not found'), { statusCode: 404 });
    }

    // Authorization
    const isOwner = shipment.userId._id?.toString() === userId || shipment.userId?.toString() === userId;
    const isAdmin = roles?.includes('admin');

    if (!isOwner && !isAdmin) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
    }

    return { shipment };
  }

  /**
   * Create shipping order
   */
  static async createShipment(userId, data) {
    // Validate
    const parsed = shippingCreateSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(
        new Error('Missing required fields: type, pickup address, delivery address, packages'),
        { statusCode: 400 }
      );
    }

    const {
      type, pickup, delivery, packages,
      declaredValue, insurance, specialInstructions,
    } = parsed.data;

    // Calculate totals
    const totalWeight = packages.reduce((sum, pkg) => sum + (pkg.weight * pkg.quantity), 0);
    const totalVolume = packages.reduce(
      (sum, pkg) => sum + ((pkg.length * pkg.width * pkg.height * pkg.quantity) / 1000000),
      0
    ); // m³

    // Create shipment
    const shipment = await ShippingRepository.create({
      userId,
      type,
      pickup: {
        ...pickup,
        pickupDate: pickup.pickupDate || new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      delivery,
      packages: packages.map(pkg => ({
        ...pkg,
        quantity: pkg.quantity || 1,
      })),
      totalWeight,
      totalVolume,
      declaredValue: declaredValue || packages.reduce(
        (sum, pkg) => sum + (pkg.value * (pkg.quantity || 1)), 0
      ),
      insurance: insurance || { isInsured: false },
      specialInstructions,
      status: 'draft',
    });

    // Notify
    await NotificationService.createNotification({
      userId,
      notificationType: 'shipment_created',
      title: 'Shipment Created',
      description: `Shipment ${shipment.orderNumber} has been created. Complete booking to get quotes.`,
      data: {
        relatedId: shipment._id,
        relatedModel: 'ShippingOrder',
        actionUrl: `/dashboard/buyer/shipping/${shipment._id}`,
      },
      priority: 'medium',
    }).catch(err => console.error('Shipping notification error:', err));

    return { shipment, message: 'Shipment created successfully' };
  }

  /**
   * Perform action on shipment (book/cancel)
   */
  static async performAction(userId, roles, shipmentId, data) {
    // Validate
    const parsed = shipmentActionSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(new Error('Invalid action'), { statusCode: 400 });
    }

    const { action } = parsed.data;

    // Find shipment
    const shipment = await ShippingRepository.findById(shipmentId);
    if (!shipment) {
      throw Object.assign(new Error('Shipment not found'), { statusCode: 404 });
    }

    // Authorization
    const isOwner = shipment.userId.toString() === userId;
    const isAdmin = roles?.includes('admin');
    if (!isOwner && !isAdmin) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
    }

    if (action === 'book') {
      shipment.status = 'booked';
      shipment.carrier = 'DHL';
      shipment.carrierService = 'Express Worldwide';
      shipment.trackingNumber = `DHL${Date.now().toString(36).toUpperCase()}`;
      shipment.estimatedDelivery = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await NotificationService.createNotification({
        userId,
        notificationType: 'shipment_booked',
        title: 'Shipment Booked',
        description: `Your shipment ${shipment.orderNumber} has been booked with ${shipment.carrier}.`,
        data: {
          relatedId: shipment._id,
          relatedModel: 'ShippingOrder',
          actionUrl: `/dashboard/buyer/shipping/${shipment._id}`,
        },
        priority: 'high',
      }).catch(err => console.error('Shipping notification error:', err));

    } else if (action === 'cancel') {
      shipment.status = 'cancelled';

      await NotificationService.createNotification({
        userId,
        notificationType: 'shipment_cancelled',
        title: 'Shipment Cancelled',
        description: `Shipment ${shipment.orderNumber} has been cancelled.`,
        data: {
          relatedId: shipment._id,
          relatedModel: 'ShippingOrder',
          actionUrl: `/dashboard/buyer/shipping/${shipment._id}`,
        },
        priority: 'medium',
      }).catch(err => console.error('Shipping notification error:', err));
    }

    await ShippingRepository.save(shipment);

    return { shipment, message: `Shipment ${action}ed successfully` };
  }
}

export default ShippingService;