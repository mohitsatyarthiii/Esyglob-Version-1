import ShipmentRepository from '../repositories/shipment.repository.js';
import { shipmentCreateSchema } from '../validators/shipment.validator.js';
import { getLogisticsProvider } from '../lib/integrations/logistics.js';
import TradeWorkflowService from './trade-workflow.service.js';

class ShipmentService {
  /**
   * Get shipments for authenticated user
   */
  static async getShipments(userId) {
    const shipments = await ShipmentRepository.findByUser(userId);
    return { shipments };
  }

  /**
   * Create shipment (seller only)
   */
  static async createShipment(userId, roles, data) {
    // Parse and validate
    const parsed = shipmentCreateSchema.safeParse(data);
    if (!parsed.success) {
      throw Object.assign(new Error('Invalid shipment data'), { statusCode: 400 });
    }

    const { orderId, provider = 'manual', trackingNumber, estimatedDeliveryAt, serviceLevel } = parsed.data;

    // Find seller
    const seller = await ShipmentRepository.findSellerByUserId(userId);
    if (!seller) {
      throw Object.assign(new Error('Seller profile not found'), { statusCode: 404 });
    }

    // Find order
    const order = await ShipmentRepository.findOrderBySeller(orderId, seller._id);
    if (!order) {
      throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    }

    // Check logistics provider
    if (provider !== 'manual') {
      const adapter = getLogisticsProvider(provider);
      if (!adapter || !adapter.configured) {
        throw Object.assign(new Error(`${provider} is not configured`), { statusCode: 409 });
      }
    }

    // Create shipment
    const shipment = await ShipmentRepository.create({
      orderId: order._id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      sellerUserId: userId,
      provider,
      trackingNumber,
      estimatedDeliveryAt,
      serviceLevel,
      status: trackingNumber ? 'label_created' : 'pending',
      events: [{
        status: trackingNumber ? 'label_created' : 'pending',
        description: 'Shipment created',
        occurredAt: new Date(),
      }],
    });

    // Update order
    if (trackingNumber) {
      order.trackingNumber = trackingNumber;
    }
    if (estimatedDeliveryAt) {
      order.estimatedDeliveryDate = estimatedDeliveryAt;
    }
    if (trackingNumber) {
      if (TradeWorkflowService.allowedNext(order.status).includes('ready_to_ship')) {
        await TradeWorkflowService.transition({ order, toStatus: 'ready_to_ship', actorId: userId, actorRole: 'seller', note: 'Shipment created and label is ready', isAdmin: roles?.includes('admin') });
      }
    }
    await ShipmentRepository.saveOrder(order);

    return { shipment };
  }
}

export default ShipmentService;
