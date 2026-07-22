const freezeTransitions = transitions => Object.freeze(
  Object.fromEntries(Object.entries(transitions).map(([status, config]) => [status, Object.freeze(config)])),
);

export const LIFECYCLE_DEFINITIONS = Object.freeze({
  rfq: freezeTransitions({
    draft: { buyer: { submit: 'submitted', cancel: 'cancelled' } },
    submitted: { buyer: { update: 'submitted', cancel: 'cancelled' }, seller: { review: 'viewed', request_information: 'information_requested', accept: 'seller_accepted', reject: 'rejected' } },
    active: { buyer: { update: 'active', cancel: 'cancelled', close: 'closed' }, seller: { review: 'viewed', request_information: 'information_requested', accept: 'seller_accepted', reject: 'rejected' } },
    viewed: { buyer: { update: 'active', cancel: 'cancelled' }, seller: { request_information: 'information_requested', submit_quotation: 'quoted', reject: 'rejected' } },
    information_requested: { buyer: { resubmit: 'submitted', cancel: 'cancelled' }, seller: {} },
    rejected: { buyer: { revise: 'draft', reopen: 'submitted' }, seller: {} },
    quoted: { buyer: { close: 'closed', cancel: 'cancelled' }, seller: { submit_quotation: 'quoted' } },
    negotiating: { buyer: { close: 'closed', cancel: 'cancelled' }, seller: {} },
    closed: { buyer: { reopen: 'active' } },
    cancelled: {}, converted: {}, archived: {}, expired: {}, seller_accepted: { seller: { submit_quotation: 'quoted', request_information: 'information_requested' } },
  }),
  quotation: freezeTransitions({
    draft: { seller: { submit: 'submitted', withdraw: 'withdrawn' } },
    pending: { seller: { submit: 'submitted', withdraw: 'withdrawn' } },
    submitted: { buyer: { accept: 'buyer_accepted', request_revision: 'revision_requested', counter_offer: 'countered', reject: 'rejected' }, seller: { withdraw: 'withdrawn' } },
    negotiating: { buyer: { accept: 'buyer_accepted', request_revision: 'revision_requested', counter_offer: 'countered', reject: 'rejected' }, seller: { revise: 'revised', withdraw: 'withdrawn' } },
    countered: { seller: { revise: 'revised', withdraw: 'withdrawn' }, buyer: { reject: 'rejected' } },
    revision_requested: { seller: { revise: 'revised', withdraw: 'withdrawn' }, buyer: { reject: 'rejected' } },
    revised: { buyer: { accept: 'buyer_accepted', request_revision: 'revision_requested', counter_offer: 'countered', reject: 'rejected' }, seller: { withdraw: 'withdrawn' } },
    buyer_accepted: { seller: { confirm: 'final_quotation_pending', request_revision: 'revision_requested', reject: 'rejected' }, buyer: { reopen: 'submitted' } },
    final_quotation_pending: { buyer: { request_revision: 'buyer_accepted', sign: 'final_quotation_signed' } },
    final_quotation_signed: { seller: { start_order: 'won' } },
    agreement_pending: { seller: { sign: 'agreement_pending' }, buyer: { sign: 'agreement_signed' } },
    agreement_signed: { seller: { start_order: 'won' } },
    rejected: { buyer: { reopen: 'submitted' } },
    withdrawn: { seller: { reopen: 'draft' } },
    won: {}, lost: {}, expired: {}, accepted: { seller: { confirm: 'final_quotation_pending' } },
  }),
  agreement: freezeTransitions({
    draft: { seller: { issue: 'awaiting_seller_signature' } },
    awaiting_seller_signature: { seller: { sign: 'awaiting_buyer_signature' } },
    awaiting_buyer_signature: { buyer: { sign: 'completed' } },
    completed: {}, void: {},
  }),
  order: freezeTransitions({
    requested: { seller: { approve: 'pending_payment', reject: 'rejected' }, buyer: { cancel: 'cancelled' } },
    draft: { buyer: { validate: 'pending_approval', cancel: 'cancelled' }, seller: { submit: 'pending_approval' } },
    pending: { buyer: { validate: 'pending_approval', cancel: 'cancelled' }, seller: { submit: 'pending_approval' } },
    pending_approval: { buyer: { select_logistics: 'pending_approval', accept_terms: 'pending_approval', approve: 'pending_payment', request_revision: 'pending_approval', reject_changes: 'rejected', cancel: 'cancelled' }, seller: { revise: 'pending_approval' } },
    awaiting_payment: { buyer: { pay: 'payment_confirmed', cancel: 'cancelled' } },
    pending_payment: { buyer: { pay: 'payment_confirmed', cancel: 'cancelled' } },
    payment_confirmed: { seller: { confirm: 'confirmed' }, platform: { confirm: 'confirmed' } },
    confirmed: { seller: { start_production: 'production', delay: 'delayed', request_information: 'waiting_buyer_response', cancel: 'cancelled' } },
    processing: { seller: { start_production: 'production', ready_to_ship: 'ready_to_ship', delay: 'delayed', request_information: 'waiting_buyer_response', cancel: 'cancelled' } },
    production: { seller: { ready_to_ship: 'ready_to_ship', delay: 'delayed', request_information: 'waiting_buyer_response', cancel: 'cancelled' }, buyer: { approve_production: 'production', request_revision: 'production' } },
    delayed: { seller: { resume: 'production', request_information: 'waiting_buyer_response', cancel: 'cancelled' } },
    waiting_buyer_response: { buyer: { reply: 'production', cancel: 'cancelled' } },
    ready_to_ship: { seller: { prepare_shipment: 'preparing_shipment', dispatch: 'pickup_scheduled', cancel: 'cancelled' } },
    preparing_shipment: { seller: { dispatch: 'pickup_scheduled', cancel: 'cancelled' } },
    pickup_scheduled: { logistics_provider: { pickup: 'picked_up' }, seller: { dispatch: 'picked_up' } },
    picked_up: { logistics_provider: { transit: 'in_transit', warehouse: 'warehouse_processing' }, seller: { transit: 'in_transit' } },
    warehouse_processing: { logistics_provider: { transit: 'in_transit' }, customs_provider: { customs: 'custom_clearance' } },
    custom_clearance: { customs_provider: { clear: 'in_transit' }, logistics_provider: { delivery: 'out_for_delivery' } },
    in_transit: { logistics_provider: { delivery: 'out_for_delivery', delivered: 'delivered', return: 'returned' }, seller: { delivered: 'delivered' } },
    shipped: { logistics_provider: { transit: 'in_transit', delivered: 'delivered' }, buyer: { dispute: 'disputed' } },
    out_for_delivery: { logistics_provider: { delivered: 'delivered', return: 'returned' }, seller: { delivered: 'delivered' } },
    delivered: { buyer: { confirm_delivery: 'completed', dispute: 'disputed' } },
    disputed: { admin: { resolve: 'completed', refund: 'refunded' }, platform: { resolve: 'completed' } },
    completed: { buyer: { close: 'closed' }, platform: { close: 'closed' } },
    closed: {}, cancelled: {}, rejected: { seller: { revise: 'pending_approval' } }, refunded: {}, returned: {}, failed: {},
  }),
  payment: freezeTransitions({ pending: { buyer: { initiate: 'initiated' } }, initiated: { platform: { verify: 'completed', fail: 'failed' } }, completed: { admin: { refund: 'refunded' } }, failed: { buyer: { retry: 'initiated' } }, refunded: {} }),
  sample_order: freezeTransitions({ requested: { seller: { approve: 'pending_payment', reject: 'rejected' } }, pending_payment: { buyer: { pay: 'payment_confirmed', cancel: 'cancelled' } }, payment_confirmed: { seller: { dispatch: 'shipped' } }, shipped: { seller: { delivered: 'delivered' } }, delivered: { buyer: { confirm_delivery: 'completed' } }, completed: {}, rejected: { buyer: { request_again: 'requested' } }, cancelled: {} }),
  logistics: freezeTransitions({ draft: { buyer: { select: 'selected' } }, selected: { seller: { book: 'booked' }, buyer: { change: 'selected' } }, booked: { logistics_provider: { pickup: 'picked_up' } }, picked_up: { logistics_provider: { transit: 'in_transit' } }, in_transit: { logistics_provider: { deliver: 'delivered' } }, delivered: {} }),
  inspection: freezeTransitions({ requested: { seller: { schedule: 'scheduled' } }, scheduled: { inspector: { start: 'in_progress' } }, in_progress: { inspector: { pass: 'passed', fail: 'failed' } }, failed: { seller: { remediate: 'requested' } }, passed: {} }),
});

export function allowedActions(type, status, actorRole) {
  const state = LIFECYCLE_DEFINITIONS[type]?.[status] || {};
  const roleActions = state[actorRole] || {};
  const adminActions = actorRole === 'admin' ? Object.assign({}, ...Object.values(state)) : {};
  return Object.entries(actorRole === 'admin' ? adminActions : roleActions).map(([action, nextStatus]) => ({ action, nextStatus }));
}

export function assertTransition({ type, status, action, actorRole, toStatus, isAdmin = false }) {
  if (isAdmin) return toStatus;
  const transition = allowedActions(type, status, actorRole).find(item => item.action === action && (!toStatus || item.nextStatus === toStatus));
  if (!transition) throw Object.assign(new Error(`${actorRole} cannot ${action} ${type} while it is ${status}`), { statusCode: 409, allowedActions: allowedActions(type, status, actorRole) });
  return transition.nextStatus;
}

export function recordTransition(entity, { type, action, fromStatus, toStatus, actorId, actorRole, notes = '', documents = [], metadata = {} }) {
  const event = { action, previousStatus: fromStatus, newStatus: toStatus, status: toStatus, actorId, actorRole, message: notes, note: notes, documents, metadata, createdAt: new Date(), timestamp: new Date() };
  if (Array.isArray(entity.activityTimeline)) entity.activityTimeline.push(event);
  if (Array.isArray(entity.timeline)) entity.timeline.push({ ...event, updatedBy: actorId });
  if (Array.isArray(entity.auditLogs)) entity.auditLogs.push({ action, fromStatus, toStatus, actorId, actorRole, note: notes, metadata: { ...metadata, documents }, timestamp: new Date() });
  entity.previousStatus = fromStatus;
  entity.status = toStatus;
  return event;
}

export function lifecycleSnapshot(type, entity, actorRole) {
  return {
    type,
    currentStatus: entity.status,
    previousStatus: entity.previousStatus || null,
    allowedActions: allowedActions(type, entity.status, actorRole),
    timeline: entity.activityTimeline || entity.timeline || [],
    revisionHistory: entity.revisionHistory || [],
    approvalHistory: entity.approvalHistory || [],
  };
}
