import CustomsClearance from '../models/CustomsClearance.js';
import Dispute from '../models/Dispute.js';
import EscrowTransaction from '../models/EscrowTransaction.js';
import QualityInspection from '../models/QualityInspection.js';
import Shipment from '../models/Shipment.js';
import TradeFinancing from '../models/TradeFinancing.js';
import Seller from '../models/Seller.js';
import Message from '../models/Message.js';
import NotificationService from './notification.service.js';
import { allowedActions, LIFECYCLE_DEFINITIONS } from './business-lifecycle.service.js';

export const TRADE_TRANSITIONS = Object.freeze(Object.fromEntries(
  Object.entries(LIFECYCLE_DEFINITIONS.order).map(([status, roles]) => [
    status,
    [...new Set(Object.values(roles).flatMap(actions => Object.values(actions)))],
  ]),
));

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
    if (order.agreement?.required && order.agreement.status !== 'completed' && !['cancelled', 'rejected'].includes(nextStatus)) blocked.push('Required agreement signatures must be completed');
    if (['pending_payment', 'awaiting_payment'].includes(nextStatus) && !order.checkout?.logisticsSelected) blocked.push('A logistics plan must be selected');
    if (['pending_payment', 'awaiting_payment'].includes(nextStatus) && !order.checkout?.termsAccepted) blocked.push('Trade terms must be digitally acknowledged');
    if (['pending_payment', 'awaiting_payment'].includes(nextStatus) && !order.checkout?.orderValidated) blocked.push('Order validation is required');
    if (['payment_confirmed', 'confirmed', 'processing', 'production'].includes(nextStatus) && order.paymentStatus !== 'paid') blocked.push('Verified payment is required');
    if (nextStatus === 'ready_to_ship' && order.tradeInformation?.inspectionRequired && context.inspection?.result !== 'pass') blocked.push('Inspection must pass before shipment');
    if (['pickup_scheduled', 'picked_up', 'in_transit'].includes(nextStatus) && !context.shipment) blocked.push('Shipment booking is required');
    if (nextStatus === 'completed' && order.status !== 'delivered' && order.status !== 'disputed') blocked.push('Delivery must be confirmed');
    if (nextStatus === 'completed' && context.dispute && !['resolved', 'closed'].includes(context.dispute.status)) blocked.push('Open dispute must be resolved');
    return blocked;
  }

  static async snapshot(order, actorRole = '') {
    const context = await this.getContext(order);
    const roleStages = actorRole ? allowedActions('order', order.status, actorRole).map(item => item.nextStatus) : [];
    const nextAllowedStages = actorRole && actorRole !== 'admin' ? [...new Set(roleStages)] : this.allowedNext(order.status);
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
      allowedActions: actorRole ? allowedActions('order', order.status, actorRole) : [],
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
    const rolePermitted = allowedActions('order', fromStatus, actorRole).some(item => item.nextStatus === toStatus);
    if (!rolePermitted && !isAdmin) throw Object.assign(new Error(`${actorRole} is not allowed to move trade from ${fromStatus} to ${toStatus}`), { statusCode: 409, allowedActions: allowedActions('order', fromStatus, actorRole) });
    const context = await this.getContext(order);
    const blockers = this.blockers(order, toStatus, context);
    if (blockers.length && !isAdmin) throw Object.assign(new Error(blockers.join('. ')), { statusCode: 409, blockers });
    order.status = toStatus;
    order.timeline.push({ status: toStatus, timestamp: new Date(), note, updatedBy: actorId });
    order.auditLogs.push({ action: 'workflow_transition', fromStatus, toStatus, actorId, actorRole, note, timestamp: new Date() });
    const next = this.allowedNext(toStatus)[0] || '';
    order.workflow = { currentStage: toStatus, previousStage: fromStatus, nextStage: next, responsibleParty: RESPONSIBILITY[toStatus] || 'platform', pendingActions: next ? [`Complete ${next.replace(/_/g, ' ')}`] : [], blockedReasons: [], lastEvaluatedAt: new Date() };
    const sellerUserId = order.sellerId?.userId || (await Seller.findById(order.sellerId).select('userId').lean())?.userId;
    const recipients = [...new Set([id(order.buyerId || order.userId), id(sellerUserId)].filter(Boolean))];
    await Promise.all(recipients.map(userId => NotificationService.createNotification({ userId, notificationType: toStatus === 'delivered' ? 'order_delivered' : 'order_confirmed', title: `Trade ${toStatus.replace(/_/g, ' ')}`, description: `Trade #${order.orderNumber} moved from ${fromStatus.replace(/_/g, ' ')} to ${toStatus.replace(/_/g, ' ')}`, data: { relatedId: order._id, relatedModel: 'Order', previousStatus: fromStatus, newStatus: toStatus, actionUrl: `/orders/${order._id}` } }).catch(() => {})));
    if (order.chatId) {
      const receiverId = id(actorId) === id(order.buyerId || order.userId) ? sellerUserId : order.buyerId || order.userId;
      await Message.create({ chatId: order.chatId, senderId: actorId, receiverId, content: `Order ${order.orderNumber}: ${fromStatus.replace(/_/g, ' ')} → ${toStatus.replace(/_/g, ' ')}${note ? `. ${note}` : ''}`, messageType: 'system', orderDetails: { orderId: order._id, orderNumber: order.orderNumber, status: toStatus } }).catch(() => {});
    }
    return order;
  }
}

export default TradeWorkflowService;
