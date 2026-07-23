import mongoose from 'mongoose';
import * as quotationRepository from '../repositories/quotation.repository.js';
import { findOrCreateConversation } from '../lib/chat-conversations.js';
import {
  OPEN_RFQ_STATUSES,
  idOf,
  idMatches,
  idListIncludes,
  toPositiveInt,
} from '../lib/rfq-helpers.js';
import { validateNoContactInfo } from '../lib/contact-moderation.js';
import { USER_ROLES } from '../lib/constants.js';
import { getIO } from '../lib/socket.js';
import { allowedActions, assertTransition, lifecycleSnapshot, recordTransition } from './business-lifecycle.service.js';
import { createTradeDocument } from './trade-artifact.service.js';

// ─── Seller Eligibility ────────────────────────────────────
async function sellerCanQuote(rfq, seller, sellerUserId) {
  if (!seller?.isActive || seller.isSuspended) return false;
  if (!OPEN_RFQ_STATUSES.includes(rfq.status)) return false;
  const sellerAccepted = rfq.status === 'seller_accepted' || rfq.repliedBySellerIds?.some(value => idMatches(value, sellerUserId)) || rfq.activityTimeline?.some(event => event.action === 'seller_accept' && idMatches(event.actorId, sellerUserId));
  if (!sellerAccepted) return false;

  if (rfq.visibility === 'private') {
    if (
      idMatches(rfq.sellerUserId, sellerUserId) ||
      idMatches(rfq.sellerId, seller._id) ||
      idListIncludes(rfq.specificSupplierIds, seller._id)
    ) {
      return true;
    }

    const Chat = (await import('../models/Chat.js')).default;
    return Chat.exists({
      rfqId: rfq._id,
      buyerId: idOf(rfq.buyerId),
      sellerId: sellerUserId,
      isActive: true,
    });
  }

  if (rfq.isVerifiedSuppliersOnly && !seller.isVerified) return false;
  if (
    rfq.preferredSuppliersCountries?.length &&
    !rfq.preferredSuppliersCountries.includes(seller.address?.country)
  ) {
    return false;
  }
  return true;
}

// ─── Get Quotations ────────────────────────────────────────
export async function getQuotations(session, searchParams) {
  const {
    rfqId,
    status,
    scope,
    page = 1,
    limit = 10,
  } = searchParams;

  const pageNum = toPositiveInt(page, 1);
  const limitNum = toPositiveInt(limit, 10, 50);
  const query = {};

  if (rfqId) {
    if (!mongoose.Types.ObjectId.isValid(rfqId)) {
      const error = new Error('RFQ not found');
      error.statusCode = 404;
      throw error;
    }
    query.rfqId = rfqId;
  }

  if (status) query.status = status;

  if (scope === 'seller' && !session.roles?.includes(USER_ROLES.SELLER)) {
    const error = new Error('Seller access required');
    error.statusCode = 403;
    throw error;
  }
  if (scope === 'buyer' && !session.roles?.includes(USER_ROLES.BUYER)) {
    const error = new Error('Buyer access required');
    error.statusCode = 403;
    throw error;
  }

  if (rfqId) {
    const rfq = await quotationRepository.findRfqById(rfqId);
    if (!rfq) {
      const error = new Error('RFQ not found');
      error.statusCode = 404;
      throw error;
    }
    if (String(rfq.buyerId) !== String(session.userId)) {
      query.userId = session.userId;
    }
  } else if (
    scope === 'seller' ||
    (!scope && session.roles?.includes(USER_ROLES.SELLER))
  ) {
    query.userId = session.userId;
  } else if (scope === 'buyer' || session.roles?.includes(USER_ROLES.BUYER)) {
    const RFQ = (await import('../models/RFQ.js')).default;
    const buyerRfqIds = await RFQ.distinct('_id', { buyerId: session.userId });
    query.rfqId = { $in: buyerRfqIds };
  }

  let [quotations, total] = await Promise.all([
    quotationRepository.findQuotations(query, (pageNum - 1) * limitNum, limitNum),
    quotationRepository.countQuotations(query),
  ]);
  const missingDocuments = quotations.filter(needsFinalQuotationDocument);
  if (missingDocuments.length) {
    for (const item of missingDocuments) await ensureFinalQuotationDocument(item._id).catch(error => console.error('[FinalQuotation-Backfill]', item._id, error.message));
    quotations = await quotationRepository.findQuotations(query, (pageNum - 1) * limitNum, limitNum);
  }

  return {
    quotations,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  };
}

// ─── Create/Revise Quotation ───────────────────────────────
export async function createQuotation(session, body) {
  const saveAsDraft = body.status === 'draft';
  const {
    rfqId,
    unitPrice,
    totalPrice,
    currency,
    minimumOrderQuantity,
    suppliedQuantity,
    leadTime,
    leadTimeUnit,
    productionTime,
    productionTimeUnit,
    paymentTerms,
    advanceRequired,
    incoterms,
    shippingCost,
    shippingEstimate,
    shippingTerms,
    packaging,
    samplePrice,
    taxes,
    specialClauses,
    pricingTiers,
    description,
    specifications,
    certifications,
    customizationAvailable,
    customizationDetails,
    notes,
    expiryDate,
    attachments,
    sellerMessage,
  } = body;

  const moderation = validateNoContactInfo({
    description,
    specifications,
    certifications,
    customizationDetails,
    notes,
    sellerMessage,
    shippingEstimate,
  });

  if (!moderation.ok) {
    const error = new Error(moderation.error);
    error.statusCode = 422;
    error.contactInfoBlocked = true;
    throw error;
  }

  if (!rfqId || (!saveAsDraft && (!unitPrice || minimumOrderQuantity === undefined || !leadTime))) {
    const error = new Error('Missing required fields');
    error.statusCode = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(rfqId)) {
    const error = new Error('RFQ not found');
    error.statusCode = 404;
    throw error;
  }

  const rfq = await quotationRepository.findRfqById(rfqId);
  if (!rfq) {
    const error = new Error('RFQ not found');
    error.statusCode = 404;
    throw error;
  }

  const seller = await quotationRepository.findSellerByUserId(session.userId);
  if (!seller) {
    const error = new Error('Seller profile not found');
    error.statusCode = 404;
    throw error;
  }

  if (!(await sellerCanQuote(rfq, seller, session.userId))) {
    const error = new Error('You are not eligible to quote this RFQ');
    error.statusCode = 403;
    throw error;
  }

  // Check for existing quotation - revise if found
  const existingQuotation = await quotationRepository.findExistingQuotation(
    rfqId,
    session.userId
  );

  if (existingQuotation) {
    return reviseExistingQuotation(
      existingQuotation,
      session,
      seller,
      rfq,
      body
    );
  }

  // Create new quotation
  const quotation = await quotationRepository.createQuotation({
    rfqId,
    productId: rfq.productId || null,
    sellerId: seller._id,
    userId: session.userId,
    unitPrice: Number(unitPrice || 0),
    totalPrice:
      totalPrice || Number(unitPrice || 0) * (suppliedQuantity || minimumOrderQuantity || 1),
    currency: currency || 'INR',
    minimumOrderQuantity: Number(minimumOrderQuantity || 1),
    suppliedQuantity,
    leadTime: Number(leadTime || 1),
    leadTimeUnit: leadTimeUnit || 'days',
    productionTime: Number(productionTime || leadTime || 0),
    productionTimeUnit: productionTimeUnit || leadTimeUnit || 'days',
    paymentTerms: paymentTerms || 'negotiable',
    advanceRequired: advanceRequired || 0,
    incoterms,
    shippingCost: shippingCost || 0,
    shippingEstimate: shippingEstimate || null,
    shippingTerms,
    packaging,
    samplePrice: Number(samplePrice || 0),
    taxes: taxes || {},
    specialClauses: specialClauses || [],
    pricingTiers: pricingTiers || [],
    description,
    specifications,
    certifications: certifications || [],
    customizationAvailable: customizationAvailable || false,
    customizationDetails,
    notes,
    expiryDate:
      expiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    attachments: attachments || [],
    sellerMessage,
    status: saveAsDraft ? 'draft' : 'submitted',
    activityTimeline: [{ action: saveAsDraft ? 'draft_saved' : 'quotation_sent', status: saveAsDraft ? 'draft' : 'submitted', message: sellerMessage || notes || 'Quotation prepared', actorId: session.userId, actorRole: 'seller' }],
    negotiationHistory: [
      {
        action: saveAsDraft ? 'message' : 'submitted',
        actorId: session.userId,
        message: sellerMessage || notes || 'Quotation submitted.',
        unitPrice: Number(unitPrice || 0),
        totalPrice:
          totalPrice || Number(unitPrice || 0) * (suppliedQuantity || minimumOrderQuantity || 1),
        minimumOrderQuantity: Number(minimumOrderQuantity || 1),
        suppliedQuantity,
        leadTime: Number(leadTime || 1),
        leadTimeUnit: leadTimeUnit || 'days',
      },
    ],
  });

  if (saveAsDraft) return { quotation, message: 'Quotation draft saved' };

  // Update RFQ
  rfq.quotationCount = (rfq.quotationCount || 0) + 1;
  if (!rfq.repliedBySellerIds.some((id) => id.toString() === session.userId)) {
    rfq.repliedBySellerIds.push(session.userId);
    rfq.status = ['viewed', 'pending', 'active', 'submitted', 'seller_accepted', 'ready_for_quotation'].includes(rfq.status)
      ? 'quoted'
      : rfq.status;
  }
  rfq.lastQuotedAt = new Date();
  await rfq.save();

  // Create conversation
  const { chat } = await findOrCreateConversation({
    buyerId: rfq.buyerId,
    sellerId: session.userId,
    productId: rfq.productId,
    rfqId: rfq._id,
    quotationId: quotation._id,
    chatType: 'rfq_negotiation',
  });

  if (!rfq.conversationId) {
    rfq.conversationId = chat._id;
    await rfq.save();
  }

  // Send message
  const messageContent = `Quotation submitted: ${quotation.currency} ${quotation.unitPrice} per unit, MOQ ${quotation.minimumOrderQuantity}, lead time ${quotation.leadTime} ${quotation.leadTimeUnit}.`;

  const chatMessage = await quotationRepository.createMessage({
    chatId: chat._id,
    senderId: session.userId,
    receiverId: rfq.buyerId,
    content: messageContent,
    messageType: 'quotation',
    rfqDetails: {
      rfqId: rfq._id,
      title: rfq.title,
      product: rfq.title,
      quantity: rfq.quantity,
      unit: rfq.unit,
      targetPrice: rfq.targetPrice,
      status: rfq.status,
      date: rfq.createdAt,
      actionUrl: `/dashboard/buyer/rfqs/${rfq._id}`,
    },
    quotationDetails: {
      quotationId: quotation._id,
      rfqId: rfq._id,
      product: rfq.title,
      unitPrice: quotation.unitPrice,
      currency: quotation.currency,
      minimumOrderQuantity: quotation.minimumOrderQuantity,
      leadTime: quotation.leadTime,
      leadTimeUnit: quotation.leadTimeUnit,
      status: quotation.status,
      actionUrl: `/dashboard/buyer/quotations/${quotation._id}`,
    },
  });

  chat.lastMessage = messageContent;
  chat.lastMessageAt = new Date();
  chat.buyerUnreadCount += 1;
  await chat.save();

  // Notify buyer
  await quotationRepository.createNotification({
    userId: rfq.buyerId,
    notificationType: 'quotation_received',
    title: 'New quotation received',
    description: `${seller.companyName || 'A seller'} quoted ${quotation.currency} ${quotation.unitPrice} per unit for ${rfq.title}`,
    data: {
      relatedId: quotation._id,
      relatedModel: 'Quotation',
      actionUrl: `/dashboard/buyer/rfqs/${rfq._id}`,
    },
    priority: 'high',
  });

  const io = getIO();
  if (io) {
    io.to(`chat_${chat._id}`).emit('new_message', chatMessage);
    io.to(`chat_${chat._id}`).emit('quotation_updated', { quotationId: quotation._id, rfqId: rfq._id, status: quotation.status });
    io.to(`user_${rfq.buyerId}`).emit('new_notification', { type: 'quotation_received', quotationId: quotation._id, rfqId: rfq._id });
  }

  return { quotation, message: 'Quotation created successfully' };
}

// ─── Revise Existing Quotation ─────────────────────────────
async function reviseExistingQuotation(existingQuotation, session, seller, rfq, body) {
  const {
    unitPrice,
    totalPrice,
    currency,
    minimumOrderQuantity,
    suppliedQuantity,
    leadTime,
    leadTimeUnit,
    productionTime,
    productionTimeUnit,
    paymentTerms,
    advanceRequired,
    incoterms,
    shippingCost,
    shippingEstimate,
    shippingTerms,
    packaging,
    samplePrice,
    taxes,
    specialClauses,
    pricingTiers,
    description,
    specifications,
    certifications,
    customizationAvailable,
    customizationDetails,
    notes,
    expiryDate,
    attachments,
    sellerMessage,
  } = body;

  if (
    !['pending', 'submitted', 'negotiating', 'countered', 'revision_requested', 'revised'].includes(
      existingQuotation.status
    )
  ) {
    const error = new Error('An active quotation already exists for this RFQ');
    error.statusCode = 409;
    error.quotationId = existingQuotation._id;
    throw error;
  }

  // Save revision history
  existingQuotation.revisionHistory.push({
    revisedAt: new Date(),
    revisedBy: session.userId,
    unitPrice: existingQuotation.unitPrice,
    totalPrice: existingQuotation.totalPrice,
    minimumOrderQuantity: existingQuotation.minimumOrderQuantity,
    suppliedQuantity: existingQuotation.suppliedQuantity,
    leadTime: existingQuotation.leadTime,
    leadTimeUnit: existingQuotation.leadTimeUnit,
    productionTime: existingQuotation.productionTime,
    productionTimeUnit: existingQuotation.productionTimeUnit,
    paymentTerms: existingQuotation.paymentTerms,
    advanceRequired: existingQuotation.advanceRequired,
    incoterms: existingQuotation.incoterms,
    shippingCost: existingQuotation.shippingCost,
    description: existingQuotation.description,
    specifications: existingQuotation.specifications,
    notes: existingQuotation.notes,
    reason: 'Seller revised quotation',
    pricingTiers: existingQuotation.pricingTiers,
    shippingEstimate: existingQuotation.shippingEstimate,
    shippingTerms: existingQuotation.shippingTerms,
    packaging: existingQuotation.packaging,
    samplePrice: existingQuotation.samplePrice,
    taxes: existingQuotation.taxes,
    specialClauses: existingQuotation.specialClauses,
  });

  // Update fields
  Object.assign(existingQuotation, {
    unitPrice,
    totalPrice:
      totalPrice ||
      unitPrice * (suppliedQuantity || minimumOrderQuantity) +
        (shippingCost || 0),
    currency: currency || existingQuotation.currency || 'INR',
    minimumOrderQuantity,
    suppliedQuantity,
    leadTime,
    leadTimeUnit: leadTimeUnit || 'days',
    productionTime: productionTime ?? existingQuotation.productionTime,
    productionTimeUnit: productionTimeUnit || existingQuotation.productionTimeUnit || 'days',
    paymentTerms: paymentTerms || 'negotiable',
    advanceRequired: advanceRequired || 0,
    incoterms,
    shippingCost: shippingCost || 0,
    shippingEstimate: shippingEstimate || existingQuotation.shippingEstimate,
    shippingTerms: shippingTerms ?? existingQuotation.shippingTerms,
    packaging: packaging ?? existingQuotation.packaging,
    samplePrice: samplePrice ?? existingQuotation.samplePrice,
    taxes: taxes ?? existingQuotation.taxes,
    specialClauses: specialClauses ?? existingQuotation.specialClauses,
    pricingTiers: pricingTiers || existingQuotation.pricingTiers || [],
    description,
    specifications,
    certifications: certifications || [],
    customizationAvailable: customizationAvailable || false,
    customizationDetails,
    notes,
    sellerMessage,
    expiryDate: expiryDate || existingQuotation.expiryDate,
    attachments: attachments || existingQuotation.attachments || [],
    status:
      existingQuotation.status === 'revision_requested' ||
      existingQuotation.status === 'countered'
        ? 'revised'
        : 'negotiating',
  });

  existingQuotation.revisionNumber += 1;
  existingQuotation.negotiationHistory.push({
    action: 'seller_revision',
    actorId: session.userId,
    message: sellerMessage || notes || 'Seller revised the quotation.',
    unitPrice: existingQuotation.unitPrice,
    totalPrice: existingQuotation.totalPrice,
    minimumOrderQuantity: existingQuotation.minimumOrderQuantity,
    suppliedQuantity: existingQuotation.suppliedQuantity,
    leadTime: existingQuotation.leadTime,
    leadTimeUnit: existingQuotation.leadTimeUnit,
  });

  await existingQuotation.save();

  // Update RFQ
  rfq.status = 'negotiating';
  rfq.lastQuotedAt = new Date();
  await rfq.save();

  // Notify buyer
  await quotationRepository.createNotification({
    userId: rfq.buyerId,
    notificationType: 'quotation_revised',
    title: 'Quotation revised',
    description: `${seller.companyName || 'A seller'} revised a quotation for ${rfq.title}`,
    data: {
      relatedId: existingQuotation._id,
      relatedModel: 'Quotation',
      actionUrl: `/dashboard/buyer/rfqs/${rfq._id}`,
    },
    priority: 'high',
  });

  // Create conversation and message
  const { chat } = await findOrCreateConversation({
    buyerId: rfq.buyerId,
    sellerId: session.userId,
    productId: rfq.productId,
    rfqId: rfq._id,
    quotationId: existingQuotation._id,
    chatType: 'rfq_negotiation',
  });

  const revisionMessage = `Quotation revised: ${existingQuotation.currency} ${existingQuotation.unitPrice} per unit, MOQ ${existingQuotation.minimumOrderQuantity}, lead time ${existingQuotation.leadTime} ${existingQuotation.leadTimeUnit}.`;

  await quotationRepository.createMessage({
    chatId: chat._id,
    senderId: session.userId,
    receiverId: rfq.buyerId,
    content: revisionMessage,
    messageType: 'quotation',
    rfqDetails: {
      rfqId: rfq._id,
      title: rfq.title,
      quantity: rfq.quantity,
      targetPrice: rfq.targetPrice,
    },
    quotationDetails: {
      quotationId: existingQuotation._id,
      rfqId: rfq._id,
      product: rfq.title,
      unitPrice: existingQuotation.unitPrice,
      currency: existingQuotation.currency,
      minimumOrderQuantity: existingQuotation.minimumOrderQuantity,
      leadTime: existingQuotation.leadTime,
      leadTimeUnit: existingQuotation.leadTimeUnit,
      status: existingQuotation.status,
      actionUrl: `/dashboard/buyer/quotations/${existingQuotation._id}`,
    },
  });

  chat.lastMessage = revisionMessage;
  chat.lastMessageAt = new Date();
  chat.buyerUnreadCount += 1;
  await chat.save();

  return { quotation: existingQuotation, message: 'Quotation revised successfully' };
}

// ─── Get Quotation Detail ──────────────────────────────────
export async function getQuotationDetail(session, quotationId) {
  let quotation = await quotationRepository.findQuotationById(quotationId);

  if (!quotation) {
    const error = new Error('Quotation not found');
    error.statusCode = 404;
    throw error;
  }

  const isAuthorized =
    quotation.rfqId.buyerId.toString() === session.userId ||
    quotation.userId._id.toString() === session.userId;

  if (!isAuthorized) {
    const error = new Error('Unauthorized');
    error.statusCode = 403;
    throw error;
  }

  const actorRole = quotation.rfqId.buyerId.toString() === session.userId ? 'buyer' : 'seller';
  const result = quotation.toObject();
  result.lifecycle = lifecycleSnapshot('quotation', result, actorRole);
  return { quotation: result };
}

// ─── Update Quotation ──────────────────────────────────────
export async function updateQuotation(session, quotationId, body) {
  const { action, reason } = body;

  const moderation = validateNoContactInfo({
    reason: body.reason,
    buyerMessage: body.buyerMessage,
    sellerMessage: body.sellerMessage,
    notes: body.notes,
    description: body.description,
    specifications: body.specifications,
    paymentTerms: body.paymentTerms,
    incoterms: body.incoterms,
    shippingEstimate: body.shippingEstimate,
    warranty: body.warranty,
  });

  if (!moderation.ok) {
    const error = new Error(moderation.error);
    error.statusCode = 422;
    error.contactInfoBlocked = true;
    throw error;
  }

  const quotation = await quotationRepository.findQuotationByIdLean(quotationId);

  if (!quotation) {
    const error = new Error('Quotation not found');
    error.statusCode = 404;
    throw error;
  }

  if (action === 'withdraw' || action === 'send') {
    if (quotation.userId.toString() !== session.userId) { const error = new Error('Unauthorized'); error.statusCode = 403; throw error; }
    if (action === 'withdraw' && !['draft','pending','submitted','negotiating','countered','revision_requested','revised'].includes(quotation.status)) { const error = new Error('Quotation can no longer be withdrawn'); error.statusCode = 409; throw error; }
    if (action === 'send' && quotation.status !== 'draft') { const error = new Error('Only a draft quotation can be sent'); error.statusCode = 409; throw error; }
    quotation.status = action === 'withdraw' ? 'withdrawn' : 'submitted';
    quotation.activityTimeline.push({ action: action === 'withdraw' ? 'quotation_withdrawn' : 'quotation_sent', status: quotation.status, message: reason || body.sellerMessage || `Quotation ${action}`, actorId: session.userId, actorRole: 'seller' });
    await quotation.save();
    return { quotation, message: action === 'withdraw' ? 'Quotation withdrawn' : 'Quotation sent to buyer' };
  }
  if (needsFinalQuotationDocument(quotation)) {
    await ensureFinalQuotationDocument(quotation._id);
    quotation = await quotationRepository.findQuotationById(quotationId);
  }

  if (action === 'confirm') {
    if (quotation.userId.toString() !== session.userId) { const error = new Error('Only the seller can confirm the final quotation'); error.statusCode = 403; throw error; }
    const nextStatus = assertTransition({ type: 'quotation', status: quotation.status, action, actorRole: 'seller' });
    const previousStatus = quotation.status;
    const finalFields = ['suppliedQuantity','unitPrice','totalPrice','packaging','shippingEstimate','leadTime','leadTimeUnit','productionTime','productionTimeUnit','paymentTerms','warranty','notes','specialClauses','attachments','shippingTerms'];
    for (const field of finalFields) if (body[field] !== undefined) quotation[field] = field === 'specialClauses' && !Array.isArray(body[field]) ? String(body[field]).split('\n').map(value => value.trim()).filter(Boolean) : body[field];
    quotation.totalPrice = Number(body.totalPrice || (Number(quotation.unitPrice || 0) * Number(quotation.suppliedQuantity || 0) + Number(quotation.shippingCost || 0) + Number(quotation.taxes?.amount || 0)));
    recordTransition(quotation, { type: 'quotation', action, fromStatus: previousStatus, toStatus: nextStatus, actorId: session.userId, actorRole: 'seller', notes: reason || 'Seller confirmed the accepted commercial terms' });
    quotation.finalQuotation = { ...(quotation.finalQuotation?.toObject?.() || quotation.finalQuotation || {}), finalQuotationNumber: quotation.finalQuotation?.finalQuotationNumber || `FQ-${Date.now()}-${String(quotation._id).slice(-6).toUpperCase()}`, status: 'awaiting_seller_signature', preparedAt: new Date(), sellerSignedAt: null, buyerSignedAt: null, lockedAt: null };
    quotation.approvalHistory.push({ action: 'final_quotation_prepared', previousStatus, newStatus: nextStatus, actorId: session.userId, actorRole: 'seller', notes: reason || 'Seller prepared the Final Quotation' });
    const { finalRfq, document } = await createFinalQuotationDocument(quotation, session.userId, reason);
    const updated = await quotationRepository.findQuotationByIdLean(quotationId);
    await publishQuotationContext({ quotation: updated, rfq: finalRfq, actorId: session.userId, receiverId: finalRfq?.buyerId, content: `Final Quotation ${updated.finalQuotation?.finalQuotationNumber} was generated. The Seller signature is required before Buyer review.` });
    return { quotation: updated, document, message: 'Final Quotation generated. Add the Seller signature to send it to the Buyer.' };
  }

  if (action === 'reopen') {
    const rfq = await quotationRepository.findRfqById(quotation.rfqId);
    if (!rfq || rfq.buyerId.toString() !== session.userId) { const error = new Error('Only the buyer can reopen this quotation'); error.statusCode = 403; throw error; }
    const nextStatus = assertTransition({ type: 'quotation', status: quotation.status, action, actorRole: 'buyer' });
    const previousStatus = quotation.status;
    recordTransition(quotation, { type: 'quotation', action, fromStatus: previousStatus, toStatus: nextStatus, actorId: session.userId, actorRole: 'buyer', notes: reason || 'Buyer reopened quotation for a new review cycle' });
    await quotation.save();
    return { quotation, message: 'Quotation reopened' };
  }

  // Buyer actions: request_revision, counter_offer
  if (action === 'request_revision' || action === 'counter_offer') {
    const rfq = await quotationRepository.findRfqById(quotation.rfqId);
    if (!rfq || rfq.buyerId.toString() !== session.userId) {
      const error = new Error('Only RFQ creator can negotiate this quotation');
      error.statusCode = 403;
      throw error;
    }

    const previousStatus = quotation.status;
    quotation.status = assertTransition({ type: 'quotation', status: previousStatus, action, actorRole: 'buyer' });
    if (previousStatus === 'final_quotation_pending') {
      const currentFinal = quotation.tradeDocuments.id(quotation.finalQuotation?.documentId);
      if (currentFinal) currentFinal.status = 'void';
      quotation.finalQuotation.status = 'changes_requested';
      quotation.activityTimeline.push({ action: 'final_quotation_changes_requested', status: 'buyer_accepted', message: reason || body.buyerMessage || 'Buyer requested changes to the Final Quotation', actorId: session.userId, actorRole: 'buyer', metadata: { documentId: currentFinal?._id, version: currentFinal?.version } });
    }

    const counterFields = {
      unitPrice: body.unitPrice,
      totalPrice: body.totalPrice,
      minimumOrderQuantity: body.minimumOrderQuantity,
      suppliedQuantity: body.suppliedQuantity,
      leadTime: body.leadTime,
      leadTimeUnit: body.leadTimeUnit,
    };

    quotation.revisionHistory.push({
      revisedAt: new Date(),
      revisedBy: session.userId,
      unitPrice: quotation.unitPrice,
      totalPrice: quotation.totalPrice,
      minimumOrderQuantity: quotation.minimumOrderQuantity,
      suppliedQuantity: quotation.suppliedQuantity,
      leadTime: quotation.leadTime,
      leadTimeUnit: quotation.leadTimeUnit,
      paymentTerms: quotation.paymentTerms,
      advanceRequired: quotation.advanceRequired,
      incoterms: quotation.incoterms,
      shippingCost: quotation.shippingCost,
      description: quotation.description,
      specifications: quotation.specifications,
      notes: quotation.notes,
      reason,
      pricingTiers: quotation.pricingTiers,
      shippingEstimate: quotation.shippingEstimate,
    });

    quotation.negotiationHistory.push({
      action: action === 'counter_offer' ? 'buyer_counter' : 'message',
      actorId: session.userId,
      message: reason || body.buyerMessage || 'Buyer requested changes.',
      ...Object.fromEntries(
        Object.entries(counterFields).filter(
          ([, value]) => value !== undefined && value !== ''
        )
      ),
    });

    quotation.buyerMessage =
      body.buyerMessage || reason || quotation.buyerMessage;

    quotation.previousStatus = previousStatus;
    quotation.approvalHistory.push({ action, previousStatus, newStatus: quotation.status, actorId: session.userId, actorRole: 'buyer', notes: reason || body.buyerMessage, documents: body.attachments || [] });
    quotation.activityTimeline.push({ action, status: quotation.status, message: reason || body.buyerMessage || 'Buyer requested quotation changes', actorId: session.userId, actorRole: 'buyer', metadata: { requestedChanges: counterFields, documents: body.attachments || [] } });

    await quotation.save();

    rfq.status = 'negotiating';
    await rfq.save();

    await quotationRepository.createNotification({
      userId: quotation.userId,
      notificationType:
        action === 'counter_offer'
          ? 'quotation_counter_offer'
          : 'quotation_revision_requested',
      title:
        action === 'counter_offer'
          ? 'Counter offer received'
          : 'Quotation revision requested',
      description: reason || 'The buyer requested changes to your quotation.',
      data: {
        relatedId: quotation._id,
        relatedModel: 'Quotation',
        actionUrl: `/dashboard/seller/rfqs/${quotation.rfqId}`,
      },
      priority: 'high',
    });

    await publishQuotationContext({ quotation, rfq, actorId: session.userId, receiverId: quotation.userId, content: action === 'counter_offer' ? 'Buyer submitted a structured counter offer. Review the requested commercial changes in the quotation workspace.' : 'Buyer requested a quotation revision. Review its notes, requested fields and documents in the quotation workspace.' });

    return {
      quotation,
      message:
        action === 'counter_offer' ? 'Counter offer sent' : 'Revision requested',
    };
  }

  // Seller: update quotation fields
  if (quotation.userId.toString() !== session.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 403;
    throw error;
  }

  if (
    !['draft', 'pending', 'submitted', 'negotiating', 'revision_requested', 'revised'].includes(
      quotation.status
    )
  ) {
    const error = new Error('Can only update open quotations');
    error.statusCode = 400;
    throw error;
  }

  const allowedFields = [
    'unitPrice', 'totalPrice', 'leadTime', 'leadTimeUnit', 'productionTime', 'productionTimeUnit',
    'paymentTerms', 'advanceRequired', 'minimumOrderQuantity',
    'suppliedQuantity', 'incoterms', 'shippingCost', 'shippingEstimate', 'shippingTerms',
    'pricingTiers', 'description', 'specifications',
    'customizationAvailable', 'customizationDetails', 'notes',
    'sellerMessage', 'attachments', 'packaging', 'samplePrice', 'taxes', 'specialClauses',
  ];

  quotation.revisionHistory.push({
    version: quotation.revisionNumber,
    revisedAt: new Date(),
    revisedBy: session.userId,
    unitPrice: quotation.unitPrice,
    totalPrice: quotation.totalPrice,
    minimumOrderQuantity: quotation.minimumOrderQuantity,
    suppliedQuantity: quotation.suppliedQuantity,
    leadTime: quotation.leadTime,
    leadTimeUnit: quotation.leadTimeUnit,
    paymentTerms: quotation.paymentTerms,
    advanceRequired: quotation.advanceRequired,
    incoterms: quotation.incoterms,
    shippingCost: quotation.shippingCost,
    description: quotation.description,
    specifications: quotation.specifications,
    notes: quotation.notes,
    reason: body.reason || 'Seller revision',
    pricingTiers: quotation.pricingTiers,
    shippingEstimate: quotation.shippingEstimate,
    changedFields: allowedFields.filter(key => body[key] !== undefined && JSON.stringify(body[key]) !== JSON.stringify(quotation[key])),
    documents: quotation.attachments || [],
    snapshot: Object.fromEntries(allowedFields.map(key => [key, quotation[key]])),
  });

  Object.keys(body).forEach((key) => {
    if (allowedFields.includes(key)) {
      quotation[key] = body[key];
    }
  });

  quotation.revisionNumber += 1;
  const previousStatus = quotation.status;
  quotation.status = 'revised';
  quotation.negotiationHistory.push({
    action: 'seller_revision',
    actorId: session.userId,
    message: body.sellerMessage || body.notes || 'Seller revised the quotation.',
    unitPrice: quotation.unitPrice,
    totalPrice: quotation.totalPrice,
    minimumOrderQuantity: quotation.minimumOrderQuantity,
    suppliedQuantity: quotation.suppliedQuantity,
    leadTime: quotation.leadTime,
    leadTimeUnit: quotation.leadTimeUnit,
  });

  quotation.totalPrice =
    quotation.totalPrice ||
    quotation.unitPrice *
      (quotation.suppliedQuantity || quotation.minimumOrderQuantity || 1) +
      (quotation.shippingCost || 0);

  quotation.previousStatus = previousStatus;
  quotation.activityTimeline.push({ action: 'seller_revision', status: 'revised', message: body.sellerMessage || body.notes || `Quotation version ${quotation.revisionNumber} submitted`, actorId: session.userId, actorRole: 'seller', metadata: { version: quotation.revisionNumber, documents: quotation.attachments || [] } });

  await quotation.save();

  const rfq = await quotationRepository.findRfqById(quotation.rfqId);
  if (rfq) {
    rfq.status = 'negotiating';
    rfq.activityTimeline.push({ action: 'quotation_revised', status: 'negotiating', message: `Quotation version ${quotation.revisionNumber} is ready for buyer review`, actorId: session.userId, actorRole: 'seller', metadata: { quotationId: quotation._id } });
    await rfq.save();
    await quotationRepository.createNotification({ userId: rfq.buyerId, notificationType: 'quotation_revised', title: 'Quotation revision ready', description: `Version ${quotation.revisionNumber} is ready for review.`, data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}` }, priority: 'high' });
  }

  return { quotation, message: 'Quotation updated successfully' };
}

// ─── Accept/Reject Quotation ───────────────────────────────
export async function respondToQuotation(session, quotationId, body) {
  const { action, reason, shippingAddress, buyerCompany, sellerCompany, tradeInformation } = body;

  const moderation = validateNoContactInfo({
    reason,
    buyerCompany,
    sellerCompany,
    tradeInformation,
    shippingAddress,
  });

  if (!moderation.ok) {
    const error = new Error(moderation.error);
    error.statusCode = 422;
    error.contactInfoBlocked = true;
    throw error;
  }

  const quotation = await quotationRepository.findQuotationById(quotationId);

  if (!quotation) {
    const error = new Error('Quotation not found');
    error.statusCode = 404;
    throw error;
  }

  if (quotation.rfqId.buyerId.toString() !== session.userId) {
    const error = new Error('Only RFQ creator can respond to quotations');
    error.statusCode = 403;
    throw error;
  }

  if (!['accept', 'reject'].includes(action)) {
    const error = new Error('Invalid action');
    error.statusCode = 400;
    throw error;
  }

  const previousStatus = quotation.status;
  if (action === 'accept' && previousStatus === 'buyer_accepted') {
    const updatedQuotation = await quotationRepository.findQuotationByIdLean(quotationId);
    await quotationRepository.createNotification({ userId: quotation.userId, notificationType: 'quotation_accepted', title: 'Buyer accepted — prepare the Final Quotation', description: 'Complete the final execution details and send the Final Quotation for Buyer signature.', data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}?role=seller#final-quotation-title` }, priority: 'high' }).catch(() => {});
    await publishQuotationContext({ quotation: updatedQuotation, rfq: quotation.rfqId, actorId: session.userId, receiverId: quotation.userId, content: 'Buyer accepted the negotiated quotation. Prepare the Final Quotation to continue.' }).catch(() => {});
    return { quotation: updatedQuotation, tradeOrder: null, reused: true, message: 'Quotation is already accepted and awaiting the Seller\'s Final Quotation.' };
  }
  const reviewableStatuses = ['pending', 'submitted', 'negotiating', 'revised'];
  if ((action === 'accept' || action === 'reject') && !reviewableStatuses.includes(previousStatus)) {
    const error = new Error(
      `Quotation cannot be ${action}ed from ${quotation.status} status`
    );
    error.statusCode = 409;
    throw error;
  }

  if (action === 'accept') {
    quotation.status = assertTransition({ type: 'quotation', status: previousStatus, action: 'accept', actorRole: 'buyer' });
    quotation.previousStatus = previousStatus;
    quotation.acceptedAt = new Date();
    quotation.rejectedAt = null;
    quotation.rejectionReason = null;
    quotation.finalQuotation = { finalQuotationNumber: `FQ-${Date.now()}-${String(quotation._id).slice(-6).toUpperCase()}`, status: 'seller_preparation', version: 1 };
    quotation.negotiationHistory.push({
      action: 'accepted',
      actorId: session.userId,
      message: 'Buyer accepted the negotiated quotation. Seller must now prepare the Final Quotation.',
    });
    quotation.approvalHistory.push({ action: 'buyer_accepted', previousStatus, newStatus: quotation.status, actorId: session.userId, actorRole: 'buyer', notes: reason || 'Buyer accepted final quotation' });
    quotation.activityTimeline.push({ action: 'buyer_accepted', status: quotation.status, message: 'Waiting for Seller to prepare the Final Quotation', actorId: session.userId, actorRole: 'buyer' });
  } else {
    quotation.status = 'rejected';
    quotation.rejectedAt = new Date();
    quotation.rejectionReason = reason || null;
    quotation.negotiationHistory.push({
      action: 'rejected',
      actorId: session.userId,
      message: reason || 'Buyer rejected the quotation.',
    });
  }

  await quotation.save();

  if (action === 'accept') {
    const updatedQuotation = await quotationRepository.findQuotationByIdLean(quotationId);
    const sellerNotification = await quotationRepository.createNotification({ userId: quotation.userId, notificationType: 'quotation_accepted', title: 'Buyer accepted — prepare the Final Quotation', description: 'Complete the final execution details and send the Final Quotation for Buyer signature.', data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}?role=seller#final-quotation-title` }, priority: 'high' });
    await publishQuotationContext({ quotation: updatedQuotation, rfq: quotation.rfqId, actorId: session.userId, receiverId: quotation.userId, content: 'Buyer accepted the negotiated quotation. Prepare the Final Quotation to continue.' });
    const io = getIO();
    if (io) {
      const event = { quotationId: quotation._id, rfqId: quotation.rfqId?._id || quotation.rfqId, status: quotation.status, action };
      io.to(`user_${quotation.userId?._id || quotation.userId}`).emit('new_notification', sellerNotification);
      io.to(`user_${quotation.userId?._id || quotation.userId}`).emit('quotation_updated', event);
      io.to(`user_${session.userId}`).emit('quotation_updated', event);
    }
    return { quotation: updatedQuotation, tradeOrder: null, message: 'Quotation accepted. The Seller will now prepare the Final Quotation.' };
  }

  await quotationRepository.createNotification({
    userId: quotation.userId,
    notificationType: 'quotation_rejected',
    title: 'Quotation rejected',
    description: reason || 'The buyer rejected your quotation.',
    data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}?role=seller` },
  });

  const io = getIO();
  if (io) {
    const event = { quotationId: quotation._id, rfqId: quotation.rfqId?._id || quotation.rfqId, status: quotation.status, action };
    io.to(`user_${quotation.userId?._id || quotation.userId}`).emit('quotation_updated', event);
    io.to(`user_${session.userId}`).emit('quotation_updated', event);
  }

  return { quotation, tradeOrder: null, message: 'Quotation rejected successfully' };
}

async function finalQuotationSnapshot(quotation) {
  const finalRfq = await quotationRepository.findRfqById(quotation.rfqId);
  const [buyer, sellerUser, sellerProfile, product] = await Promise.all([
    finalRfq ? quotationRepository.findUserById(finalRfq.buyerId) : null,
    quotationRepository.findUserById(quotation.userId),
    quotationRepository.findSellerByUserId(quotation.userId),
    quotation.productId || finalRfq?.productId ? quotationRepository.findProductById(quotation.productId?._id || quotation.productId || finalRfq?.productId) : null,
  ]);
  const buyerCompany = buyer?.metadata?.companyName || buyer?.companyName;
  const buyerAddress = buyer?.metadata?.address || buyer?.address;
  const sellerAddress = sellerProfile?.address;
  const productImage = product?.images?.[0]?.url || product?.images?.[0] || finalRfq?.images?.[0]?.url || finalRfq?.images?.[0];
  return {
    finalRfq,
    content: {
      finalQuotationNumber: quotation.finalQuotation?.finalQuotationNumber,
      agreementNumber: quotation.finalQuotation?.finalQuotationNumber,
      quotationNumber: quotation.quotationNumber,
      rfqNumber: finalRfq?.rfqNumber,
      revisionNumber: quotation.revisionNumber,
      rfqId: quotation.rfqId,
      tradeReference: quotation.quotationNumber || finalRfq?.rfqNumber,
      buyer: { name: buyer?.fullName, company: buyerCompany, email: buyer?.email, phone: buyer?.phone, address: buyerAddress, country: buyer?.metadata?.country || buyerAddress?.country },
      seller: { name: sellerUser?.fullName, company: sellerProfile?.companyName, email: sellerUser?.email, phone: sellerProfile?.businessPhone || sellerUser?.phone, address: sellerAddress, country: sellerAddress?.country, registrationNumber: sellerProfile?.businessRegistrationNumber, taxNumber: sellerProfile?.gstNumber },
      products: [{ productId: quotation.productId?._id || quotation.productId || finalRfq?.productId, name: product?.name || quotation.productId?.name || finalRfq?.title, image: productImage, brand: product?.brand, sku: product?.sku, countryOfOrigin: product?.countryOfOrigin, specifications: quotation.specifications || finalRfq?.specifications, quantity: quotation.suppliedQuantity || finalRfq?.quantity, unit: finalRfq?.unit, minimumOrderQuantity: quotation.minimumOrderQuantity, unitPrice: quotation.unitPrice, totalPrice: quotation.totalPrice }],
      pricing: { unitPrice: quotation.unitPrice, totalPrice: quotation.totalPrice, currency: quotation.currency },
      minimumOrderQuantity: quotation.minimumOrderQuantity,
      production: { timeline: quotation.productionTime, unit: quotation.productionTimeUnit },
      shipping: { cost: quotation.shippingCost, estimate: quotation.shippingEstimate },
      delivery: { leadTime: quotation.leadTime, leadTimeUnit: quotation.leadTimeUnit },
      paymentTerms: quotation.paymentTerms,
      incoterms: quotation.incoterms,
      taxes: quotation.taxes,
      packaging: quotation.packaging,
      warranty: quotation.warranty,
      samplePrice: quotation.samplePrice,
      shippingTerms: quotation.shippingTerms,
      specialConditions: quotation.specialClauses,
      notes: quotation.notes || quotation.sellerMessage,
      attachments: quotation.attachments,
      rfqAttachments: [...(finalRfq?.attachments || []), ...(finalRfq?.documents || []), ...(finalRfq?.drawings || [])],
      generatedAt: quotation.finalQuotation?.preparedAt || new Date(),
    },
  };
}

async function createFinalQuotationDocument(quotation, sellerUserId, reason) {
  for (const existing of quotation.tradeDocuments || []) {
    if (existing.documentType === 'quotation' && existing.metadata?.isFinalQuotation && existing.status !== 'void') existing.status = 'void';
  }
  await quotation.save();
  const { finalRfq, content } = await finalQuotationSnapshot(quotation);
  const created = await createTradeDocument('quotation', quotation._id, { _id: quotation.userId?._id || quotation.userId, roles: ['seller'] }, {
    documentType: 'quotation',
    title: `Final Quotation ${quotation.finalQuotation.finalQuotationNumber}`,
    requiresSellerSignature: true,
    requiresBuyerSignature: true,
    metadata: { isFinalQuotation: true, finalQuotationNumber: quotation.finalQuotation.finalQuotationNumber },
    notes: reason || 'Seller prepared the Final Quotation',
    content,
  });
  const refreshed = await quotationRepository.findQuotationByIdLean(quotation._id);
  refreshed.finalQuotation = { ...(refreshed.finalQuotation?.toObject?.() || refreshed.finalQuotation || {}), documentId: created.document._id, status: 'awaiting_seller_signature', version: created.document.version, preparedAt: new Date(), sellerSignedAt: null, buyerSignedAt: null, lockedAt: null };
  refreshed.activityTimeline.push({ action: 'final_quotation_generated', status: 'final_quotation_pending', message: `Final Quotation version ${created.document.version} generated for Seller signature`, actorId: sellerUserId, actorRole: 'seller', metadata: { documentId: created.document._id, version: created.document.version } });
  await refreshed.save();
  return { document: created.document, finalRfq };
}

function needsFinalQuotationDocument(quotation) {
  if (!quotation?.finalQuotation?.finalQuotationNumber) return false;
  if (!['final_quotation_pending'].includes(String(quotation.status))) return false;
  return !(quotation.tradeDocuments || []).some(document => document.documentType === 'quotation' && document.metadata?.isFinalQuotation && document.status !== 'void');
}

export async function ensureFinalQuotationDocument(quotationId) {
  const quotation = await quotationRepository.findQuotationByIdLean(quotationId);
  if (!quotation || !needsFinalQuotationDocument(quotation)) return null;
  quotation.finalQuotation.status = 'awaiting_seller_signature';
  quotation.finalQuotation.documentId = undefined;
  quotation.finalQuotation.sellerSignedAt = null;
  quotation.finalQuotation.buyerSignedAt = null;
  quotation.finalQuotation.lockedAt = null;
  quotation.activityTimeline.push({ action: 'final_quotation_document_restored', status: 'final_quotation_pending', message: 'Missing Final Quotation document regenerated from stored commercial terms', actorId: quotation.userId, actorRole: 'seller' });
  await quotation.save();
  const result = await createFinalQuotationDocument(quotation, quotation.userId, 'Automatically restored missing Final Quotation document');
  const rfq = result.finalRfq;
  await publishQuotationContext({ quotation, rfq, actorId: quotation.userId, receiverId: rfq?.buyerId, content: `Final Quotation ${quotation.finalQuotation.finalQuotationNumber} was restored from the accepted terms. Seller signature is required before Buyer review.` }).catch(() => {});
  return result.document;
}

async function publishQuotationContext({ quotation, rfq, actorId, receiverId, content }) {
  if (!rfq || !receiverId || !content) return;
  const { chat } = await findOrCreateConversation({ buyerId: rfq.buyerId, sellerId: quotation.userId?._id || quotation.userId, productId: quotation.productId || rfq.productId, rfqId: rfq._id, quotationId: quotation._id, chatType: 'rfq_negotiation' });
  const message = await quotationRepository.createMessage({ chatId: chat._id, senderId: actorId, receiverId, content, messageType: 'system', quotationDetails: { quotationId: quotation._id, rfqId: rfq._id, unitPrice: quotation.unitPrice, currency: quotation.currency, minimumOrderQuantity: quotation.minimumOrderQuantity, leadTime: quotation.leadTime, status: quotation.status, actionUrl: `/quotations/${quotation._id}` } });
  chat.lastMessage = content; chat.lastMessageAt = new Date();
  if (String(receiverId) === String(rfq.buyerId)) chat.buyerUnreadCount += 1; else chat.sellerUnreadCount += 1;
  await chat.save();
  const io = getIO(); if (io) { const event = { quotationId: quotation._id, rfqId: rfq._id, status: quotation.status }; io.to(`chat_${chat._id}`).emit('new_message', message); io.to(`chat_${chat._id}`).emit('quotation_updated', event); io.to(`user_${receiverId}`).emit('quotation_updated', event); io.to(`user_${actorId}`).emit('quotation_updated', event); }
}
