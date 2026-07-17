import CustomsClearance from '../models/CustomsClearance.js';
import Dispute from '../models/Dispute.js';
import EscrowTransaction from '../models/EscrowTransaction.js';
import QualityInspection from '../models/QualityInspection.js';
import Shipment from '../models/Shipment.js';
import TradeFinancing from '../models/TradeFinancing.js';
import NotificationService from './notification.service.js';

export const TRADE_TRANSITIONS = Object.freeze({
  draft: ['pending_approval', 'cancelled'],
  pending: ['pending_approval', 'rejected', 'cancelled'],
  pending_approval: ['awaiting_payment', 'pending_payment', 'rejected', 'cancelled'],
  awaiting_payment: ['payment_confirmed', 'cancelled'],
  pending_payment: ['payment_confirmed', 'cancelled'],
  payment_success: ['payment_confirmed', 'refunded'],
  payment_confirmed: ['confirmed', 'refunded'],
  confirmed: ['processing', 'production', 'cancelled'],
  processing: ['production', 'ready_to_ship', 'cancelled'],
  production: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['preparing_shipment', 'pickup_scheduled', 'cancelled'],
  preparing_shipment: ['pickup_scheduled', 'cancelled'],
  pickup_scheduled: ['picked_up', 'cancelled'],
  picked_up: ['warehouse_processing', 'in_transit'],
  warehouse_processing: ['custom_clearance', 'in_transit'],
  custom_clearance: ['in_transit', 'out_for_delivery'],
  in_transit: ['custom_clearance', 'out_for_delivery', 'delivered', 'returned'],
  shipped: ['in_transit', 'delivered', 'disputed'],
  out_for_delivery: ['delivered', 'returned'],
  delivered: ['completed', 'disputed'],
  disputed: ['refunded', 'completed'],
});

const RESPONSIBILITY = {
  pending_approval: 'seller', pending_payment: 'buyer', awaiting_payment: 'buyer',
  payment_confirmed: 'platform', confirmed: 'seller', processing: 'seller', production: 'seller',
  ready_to_ship: 'seller', preparing_shipment: 'seller', pickup_scheduled: 'logistics_provider',
  picked_up: 'logistics_provider', warehouse_processing: 'logistics_provider', in_transit: 'logistics_provider',
  custom_clearance: 'customs_provider', out_for_delivery: 'logistics_provider', delivered: 'buyer',
  disputed: 'admin', completed: 'platform',
};

function id(value) { return String(value?._id || value || ''); }

class TradeWorkflowService {
  static allowedNext(status) { return TRADE_TRANSITIONS[status] || []; }

  static async getContext(order) {
    const [escrow, inspection, shipment, customs, dispute, financing] = await Promise.all([
      EscrowTransaction.findOne({ orderId: order._id }).sort({ createdAt: -1 }).lean(),
      order.inspectionId ? QualityInspection.findById(order.inspectionId).lean() : null,
      Shipment.findOne({ orderId: order._id }).sort({ createdAt: -1 }).lean(),
      order.shipmentId ? CustomsClearance.findOne({ shipmentId: order.shipmentId }).sort({ createdAt: -1 }).lean() : null,
      order.disputeId ? Dispute.findById(order.disputeId).lean() : null,
      order.tradeInformation?.financingId ? TradeFinancing.findById(order.tradeInformation.financingId).lean() : null,
    ]);
    return { escrow, inspection, shipment, customs, dispute, financing };
  }

  static blockers(order, nextStatus, context) {
    const blocked = [];
    if (['payment_confirmed', 'confirmed', 'processing', 'production'].includes(nextStatus) && order.paymentStatus !== 'paid') blocked.push('Verified payment is required');
    if (nextStatus === 'ready_to_ship' && order.tradeInformation?.inspectionRequired && context.inspection?.result !== 'pass') blocked.push('Inspection must pass before shipment');
    if (['pickup_scheduled', 'picked_up', 'in_transit'].includes(nextStatus) && !context.shipment) blocked.push('Shipment booking is required');
    if (nextStatus === 'completed' && order.status !== 'delivered' && order.status !== 'disputed') blocked.push('Delivery must be confirmed');
    if (nextStatus === 'completed' && context.dispute && !['resolved', 'closed'].includes(context.dispute.status)) blocked.push('Open dispute must be resolved');
    return blocked;
  }

  static async snapshot(order) {
    const context = await this.getContext(order);
    const nextAllowedStages = this.allowedNext(order.status);
    const blockersByStage = Object.fromEntries(nextAllowedStages.map(stage => [stage, this.blockers(order, stage, context)]));
    const availableStages = nextAllowedStages.filter(stage => blockersByStage[stage].length === 0);
    const nextStage = availableStages[0] || nextAllowedStages[0] || null;
    return {
      tradeId: order.orderNumber,
      currentStage: order.status,
      previousStages: (order.timeline || []).map(item => item.status),
      nextStage,
      allowedNextStages: availableStages,
      blockedStages: blockersByStage,
      responsibleParty: RESPONSIBILITY[order.status] || 'platform',
      pendingActions: nextStage ? [`Complete ${String(nextStage).replace(/_/g, ' ')}`] : [],
      requiredDocuments: order.tradeInformation?.documentsRequired || order.documents || [],
      escrow: context.escrow,
      production: order.production || {},
      inspection: context.inspection,
      shipment: context.shipment,
      customs: context.customs,
      dispute: context.dispute,
      financing: context.financing,
    };
  }

  static async transition({ order, toStatus, actorId, actorRole = 'user', note = '', isAdmin = false }) {
    const fromStatus = order.status;
    const permitted = this.allowedNext(fromStatus);
    if (!permitted.includes(toStatus) && !isAdmin) throw Object.assign(new Error(`Cannot move trade from ${fromStatus} to ${toStatus}`), { statusCode: 409 });
    const context = await this.getContext(order);
    const blockers = this.blockers(order, toStatus, context);
    if (blockers.length && !isAdmin) throw Object.assign(new Error(blockers.join('. ')), { statusCode: 409, blockers });
    order.status = toStatus;
    order.timeline.push({ status: toStatus, timestamp: new Date(), note, updatedBy: actorId });
    order.auditLogs.push({ action: 'workflow_transition', fromStatus, toStatus, actorId, actorRole, note, timestamp: new Date() });
    const next = this.allowedNext(toStatus)[0] || '';
    order.workflow = { currentStage: toStatus, previousStage: fromStatus, nextStage: next, responsibleParty: RESPONSIBILITY[toStatus] || 'platform', pendingActions: next ? [`Complete ${next.replace(/_/g, ' ')}`] : [], blockedReasons: [], lastEvaluatedAt: new Date() };
    await NotificationService.createNotification({ userId: order.buyerId || order.userId, notificationType: toStatus === 'delivered' ? 'order_delivered' : 'order_confirmed', title: `Trade ${toStatus.replace(/_/g, ' ')}`, description: `Trade #${order.orderNumber} moved to ${toStatus.replace(/_/g, ' ')}`, data: { relatedId: order._id, relatedModel: 'Order' } }).catch(() => {});
    return order;
  }
}

export default TradeWorkflowService;
