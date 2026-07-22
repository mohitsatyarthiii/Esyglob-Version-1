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

  const [quotations, total] = await Promise.all([
    quotationRepository.findQuotations(query, (pageNum - 1) * limitNum, limitNum),
    quotationRepository.countQuotations(query),
  ]);

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
  const quotation = await quotationRepository.findQuotationById(quotationId);

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

  if (action === 'confirm') {
    if (quotation.userId.toString() !== session.userId) { const error = new Error('Only the seller can confirm the final quotation'); error.statusCode = 403; throw error; }
    const nextStatus = assertTransition({ type: 'quotation', status: quotation.status, action, actorRole: 'seller' });
    const previousStatus = quotation.status;
    const agreementFields = ['productId','suppliedQuantity','minimumOrderQuantity','unitPrice','totalPrice','taxes','shippingCost','packaging','shippingEstimate','leadTime','leadTimeUnit','productionTime','productionTimeUnit','incoterms','paymentTerms','warranty','notes','specialClauses','attachments','shippingTerms'];
    for (const field of agreementFields) if (body[field] !== undefined) quotation[field] = field === 'specialClauses' && !Array.isArray(body[field]) ? String(body[field]).split('\n').map(value => value.trim()).filter(Boolean) : body[field];
    quotation.totalPrice = Number(body.totalPrice || (Number(quotation.unitPrice || 0) * Number(quotation.suppliedQuantity || 0) + Number(quotation.shippingCost || 0) + Number(quotation.taxes?.amount || 0)));
    recordTransition(quotation, { type: 'quotation', action, fromStatus: previousStatus, toStatus: nextStatus, actorId: session.userId, actorRole: 'seller', notes: reason || 'Seller confirmed the accepted commercial terms' });
    quotation.agreement = { ...(quotation.agreement?.toObject?.() || quotation.agreement || {}), sellerConfirmedAt: new Date() };
    quotation.approvalHistory.push({ action: 'seller_confirmed', previousStatus, newStatus: nextStatus, actorId: session.userId, actorRole: 'seller', notes: reason || 'Seller confirmed final terms' });
    await quotation.save();
    const { agreementRfq, content } = await agreementSnapshot(quotation);
    let agreementDocument = quotation.tradeDocuments.id(quotation.agreement?.documentId);
    if (!agreementDocument) {
      await ensureAutomaticAgreement(quotation);
      const refreshed = await quotationRepository.findQuotationByIdLean(quotationId);
      agreementDocument = refreshed.tradeDocuments.id(refreshed.agreement?.documentId);
      quotation.tradeDocuments = refreshed.tradeDocuments;
      quotation.agreement = refreshed.agreement;
    } else {
      agreementDocument.metadata = { ...(agreementDocument.metadata || {}), content, notes: reason || 'Seller completed the live Agreement' };
      quotation.activityTimeline.push({ action: 'agreement_completed_by_seller', status: 'agreement_pending', message: 'Seller completed the live Agreement fields; signature is required', actorId: session.userId, actorRole: 'seller', metadata: { documentId: agreementDocument._id } });
      await quotation.save();
    }
    const updated = await quotationRepository.findQuotationByIdLean(quotationId);
    await publishQuotationContext({ quotation: updated, rfq: agreementRfq, actorId: session.userId, receiverId: agreementRfq?.buyerId, content: `Seller completed Agreement ${updated.agreement?.agreementNumber}. Seller signature is now required.` });
    return { quotation: updated, message: 'Agreement details saved. Seller signature is required.' };
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

  // Check if already accepted
  if (action === 'start_order' && quotation.tradeOrderId) {
    const existingOrder = await quotationRepository.findOrderByQuotationId(quotationId);
    return {
      quotation,
      tradeOrder: existingOrder,
      reused: true,
      message: 'Quotation already accepted',
    };
  }

  const previousStatus = quotation.status;
  if (action === 'accept' && previousStatus === 'buyer_accepted') {
    const { agreementRfq } = await ensureAutomaticAgreement(quotation);
    const updatedQuotation = await quotationRepository.findQuotationByIdLean(quotationId);
    return { quotation: updatedQuotation, tradeOrder: null, reused: true, message: `Quotation is already accepted. Agreement ${updatedQuotation.agreement?.agreementNumber || ''} is ready.`.trim(), agreementRfq };
  }
  const reviewableStatuses = ['pending', 'submitted', 'negotiating', 'revised'];
  if ((action === 'accept' || action === 'reject') && !reviewableStatuses.includes(previousStatus)) {
    const error = new Error(
      `Quotation cannot be ${action}ed from ${quotation.status} status`
    );
    error.statusCode = 409;
    throw error;
  }

  if (action === 'start_order') {
    if (quotation.status !== 'agreement_signed' || quotation.agreement?.status !== 'completed') {
      const error = new Error('The agreement must be signed by both parties before an order can start');
      error.statusCode = 409;
      throw error;
    }
  } else if (action === 'accept') {
    quotation.status = assertTransition({ type: 'quotation', status: previousStatus, action: 'accept', actorRole: 'buyer' });
    quotation.previousStatus = previousStatus;
    quotation.acceptedAt = new Date();
    quotation.rejectedAt = null;
    quotation.rejectionReason = null;
    quotation.agreement = { agreementNumber: `AGR-${Date.now()}-${String(quotation._id).slice(-6).toUpperCase()}`, status: 'draft' };
    quotation.negotiationHistory.push({
      action: 'accepted',
      actorId: session.userId,
      message: 'Buyer accepted the final quotation. A live Agreement was generated for Seller review and signature.',
    });
    quotation.approvalHistory.push({ action: 'buyer_accepted', previousStatus, newStatus: quotation.status, actorId: session.userId, actorRole: 'buyer', notes: reason || 'Buyer accepted final quotation' });
    quotation.activityTimeline.push({ action: 'buyer_accepted', status: quotation.status, message: 'Live Agreement generated and waiting for Seller completion', actorId: session.userId, actorRole: 'buyer' });
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
    const { agreementRfq } = await ensureAutomaticAgreement(quotation);
    const updatedQuotation = await quotationRepository.findQuotationByIdLean(quotationId);
    const sellerNotification = await quotationRepository.createNotification({ userId: quotation.userId, notificationType: 'quotation_accepted', title: 'Buyer accepted — Agreement ready for signature', description: 'Review the pre-filled Agreement, complete any remaining commercial terms, and sign it.', data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}?role=seller#agreement-workflow-title` }, priority: 'high' });
    await publishQuotationContext({ quotation: updatedQuotation, rfq: agreementRfq || quotation.rfqId, actorId: session.userId, receiverId: quotation.userId, content: 'Buyer accepted the quotation. A live Agreement has been generated for Seller review and signature.' });
    const io = getIO();
    if (io) {
      const event = { quotationId: quotation._id, rfqId: quotation.rfqId?._id || quotation.rfqId, status: quotation.status, action };
      io.to(`user_${quotation.userId?._id || quotation.userId}`).emit('new_notification', sellerNotification);
      io.to(`user_${quotation.userId?._id || quotation.userId}`).emit('quotation_updated', event);
      io.to(`user_${session.userId}`).emit('quotation_updated', event);
    }
    return { quotation: updatedQuotation, tradeOrder: null, message: 'Quotation accepted. The live Agreement is ready for Seller review and signature.' };
  }

  let tradeOrder = null;

  if (action === 'start_order') {
    const rfq = quotation.rfqId;
    const product =
      quotation.productId ||
      (rfq.productId
        ? await quotationRepository.findProductById(rfq.productId)
        : null);
    const buyer = await quotationRepository.findUserById(rfq.buyerId);
    const sellerUser = await quotationRepository.findUserById(quotation.userId);
    const sellerProfileId = quotation.sellerId?._id || quotation.sellerId;
    const quantity =
      quotation.suppliedQuantity ||
      rfq.quantity ||
      quotation.minimumOrderQuantity;
    const totalPrice =
      quotation.totalPrice ||
      quotation.unitPrice * quantity + (quotation.shippingCost || 0);

    tradeOrder = await quotationRepository.findOrderByQuotationId(quotation._id);

    if (!tradeOrder) {
      const chat = await quotationRepository.findChatByBuyerSeller(
        rfq.buyerId,
        quotation.userId
      );

      tradeOrder = await quotationRepository.createOrder({
        userId: rfq.buyerId,
        buyerId: rfq.buyerId,
        sellerId: sellerProfileId,
        productId: product?._id || rfq.productId || undefined,
        rfqId: rfq._id,
        quotationId: quotation._id,
        chatId: chat?._id,
        orderType: 'bulk',
        orderSubType: 'trade_order',
        quantity,
        pricePerUnit: quotation.unitPrice,
        totalPrice,
        currency: quotation.currency || rfq.currency || 'INR',
        status: 'pending_approval',
        shippingAddress: shippingAddress || {
          country: rfq.deliveryCountry,
          address: rfq.deliveryPort,
        },
        buyerCompany: buyerCompany || {
          companyName:
            buyer?.metadata?.companyName || buyer?.fullName || buyer?.email,
          contactPerson: buyer?.fullName || buyer?.email,
        },
        sellerCompany: sellerCompany || {
          companyName: quotation.sellerId?.companyName,
          contactPerson: sellerUser?.fullName || sellerUser?.email,
        },
        tradeInformation: {
          incoterms:
            tradeInformation?.incoterms || quotation.incoterms || rfq.incoterms,
          paymentTerms:
            tradeInformation?.paymentTerms || quotation.paymentTerms,
          deliveryTerms:
            tradeInformation?.deliveryTerms || rfq.deliveryTimeline,
          destinationPort:
            tradeInformation?.destinationPort || rfq.deliveryPort,
          productSpecifications:
            tradeInformation?.productSpecifications ||
            quotation.specifications ||
            rfq.description,
        },
        documents: [...(rfq.attachments || []), ...(quotation.attachments || [])].map(
          (attachment) => ({
            type: 'other',
            url: attachment.url,
            filename: attachment.filename,
            uploadedAt: attachment.uploadedAt || new Date(),
          })
        ),
        sourceSnapshot: {
          rfq: rfq.toObject ? rfq.toObject() : rfq,
          quotation: quotation.toObject(),
          product: product?.toObject ? product.toObject() : product,
          buyer,
          seller: {
            profile: quotation.sellerId?.toObject
              ? quotation.sellerId.toObject()
              : quotation.sellerId,
            user: sellerUser,
          },
        },
        checkout: { logisticsSelected: false, termsAccepted: false, orderValidated: true, validatedAt: new Date() },
        agreement: { required: true, documentId: quotation.agreement.documentId, status: 'completed', completedAt: quotation.agreement.completedAt },
        tradeDocuments: quotation.tradeDocuments || [],
        timeline: [
          {
            status: 'pending_approval',
            timestamp: new Date(),
            note: 'Buyer started order after seller confirmation and dual signatures',
            updatedBy: session.userId,
          },
        ],
      });
    }

    quotation.tradeOrderId = tradeOrder._id;
    rfq.status = 'converted';
    rfq.acceptedQuotationId = quotation._id;
    rfq.tradeOrderId = tradeOrder._id;
    await Promise.all([quotation.save(), rfq.save()]);

    // Mark other quotations as lost
    await quotationRepository.updateQuotationStatuses(rfq._id, quotation._id, {
      status: 'lost',
      rejectedAt: new Date(),
      rejectionReason: 'Another quotation was accepted',
    });

    quotation.previousStatus = quotation.status;
    quotation.status = 'won';
    quotation.activityTimeline.push({ action: 'order_started', status: 'won', message: `Order ${tradeOrder.orderNumber} started after agreement completion`, actorId: session.userId, actorRole: 'buyer', metadata: { orderId: tradeOrder._id } });
    await quotation.save();

    // Create order message
    if (tradeOrder.chatId) {
      await quotationRepository.createMessage({
        chatId: tradeOrder.chatId,
        senderId: session.userId,
        receiverId: quotation.userId,
        content: `Agreement completed. Trade order ${tradeOrder.orderNumber} has been started by the buyer.`,
        messageType: 'order',
        orderDetails: {
          orderId: tradeOrder._id,
          orderNumber: tradeOrder.orderNumber,
          quantity: tradeOrder.quantity,
          price: tradeOrder.totalPrice,
        },
        quotationDetails: {
          quotationId: quotation._id,
          rfqId: rfq._id,
          unitPrice: quotation.unitPrice,
          leadTime: quotation.leadTime,
          status: quotation.status,
        },
      });
    }

    // Notify seller
    await quotationRepository.createNotification({
      userId: quotation.userId,
      notificationType: 'quotation_accepted',
      title: 'Order started',
      description: `The buyer started order ${tradeOrder.orderNumber} after completing the agreement.`,
      data: {
        relatedId: tradeOrder._id,
        relatedModel: 'Order',
        actionUrl: `/dashboard/seller/orders/${tradeOrder._id}`,
      },
      priority: 'high',
    });

    // Notify buyer
    await quotationRepository.createNotification({
      userId: rfq.buyerId,
      notificationType: 'rfq_converted_to_order',
      title: 'RFQ converted to order',
      description: `Your RFQ ${rfq.title} is now a trade order.`,
      data: {
        relatedId: tradeOrder._id,
        relatedModel: 'Order',
        actionUrl: `/dashboard/buyer/orders/${tradeOrder._id}`,
      },
      priority: 'high',
    });
  } else {
    // Rejection notification
    await quotationRepository.createNotification({
      userId: quotation.userId,
      notificationType: 'quotation_rejected',
      title: 'Quotation rejected',
      description: reason || 'The buyer rejected your quotation.',
      data: {
        relatedId: quotation._id,
        relatedModel: 'Quotation',
        actionUrl: `/dashboard/seller/rfqs/${quotation.rfqId._id}`,
      },
    });
  }

  const io = getIO();
  if (io) {
    const event = { quotationId: quotation._id, rfqId: quotation.rfqId?._id || quotation.rfqId, orderId: tradeOrder?._id, status: quotation.status, action };
    if (tradeOrder?.chatId) io.to(`chat_${tradeOrder.chatId}`).emit('quotation_updated', event);
    io.to(`user_${quotation.userId?._id || quotation.userId}`).emit('quotation_updated', event);
    io.to(`user_${session.userId}`).emit('quotation_updated', event);
  }

  return { quotation, tradeOrder, message: action === 'start_order' ? 'Order started successfully' : 'Quotation rejected successfully' };
}

async function agreementSnapshot(quotation) {
  const agreementRfq = await quotationRepository.findRfqById(quotation.rfqId);
  const [buyer, sellerUser, sellerProfile] = await Promise.all([
    agreementRfq ? quotationRepository.findUserById(agreementRfq.buyerId) : null,
    quotationRepository.findUserById(quotation.userId),
    quotationRepository.findSellerByUserId(quotation.userId),
  ]);
  return {
    agreementRfq,
    content: {
      agreementNumber: quotation.agreement?.agreementNumber,
      revisionNumber: quotation.revisionNumber,
      rfqId: quotation.rfqId,
      tradeReference: quotation.quotationNumber || agreementRfq?.rfqNumber,
      buyer: { name: buyer?.fullName, company: buyer?.metadata?.companyName, email: buyer?.email },
      seller: { name: sellerUser?.fullName, company: sellerProfile?.companyName, registrationNumber: sellerProfile?.businessRegistrationNumber || sellerProfile?.gstNumber },
      products: [{ productId: quotation.productId || agreementRfq?.productId, name: quotation.productId?.name || agreementRfq?.title, quantity: quotation.suppliedQuantity || agreementRfq?.quantity, unit: agreementRfq?.unit, unitPrice: quotation.unitPrice }],
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
      generatedAt: quotation.acceptedAt || new Date(),
    },
  };
}

async function ensureAutomaticAgreement(quotation) {
  const existing = (quotation.tradeDocuments || []).find(document => ['purchase_agreement','commercial_agreement'].includes(document.documentType) && document.status !== 'void');
  if (existing) return { document: existing, agreementRfq: await quotationRepository.findRfqById(quotation.rfqId) };
  if (!quotation.agreement?.agreementNumber) quotation.agreement = { ...(quotation.agreement?.toObject?.() || quotation.agreement || {}), agreementNumber: `AGR-${Date.now()}-${String(quotation._id).slice(-6).toUpperCase()}`, status: 'draft' };
  await quotation.save();
  const { agreementRfq, content } = await agreementSnapshot(quotation);
  const created = await createTradeDocument('quotation', quotation._id, { _id: quotation.userId?._id || quotation.userId, roles: ['seller'] }, {
    documentType: 'purchase_agreement',
    title: `Purchase Agreement ${quotation.agreement.agreementNumber}`,
    requiresSellerSignature: true,
    requiresBuyerSignature: true,
    content,
  });
  return { document: created.document, agreementRfq };
}

async function publishQuotationContext({ quotation, rfq, actorId, receiverId, content }) {
  if (!rfq || !receiverId || !content) return;
  const { chat } = await findOrCreateConversation({ buyerId: rfq.buyerId, sellerId: quotation.userId?._id || quotation.userId, productId: quotation.productId || rfq.productId, rfqId: rfq._id, quotationId: quotation._id, chatType: 'rfq_negotiation' });
  await quotationRepository.createMessage({ chatId: chat._id, senderId: actorId, receiverId, content, messageType: 'system', quotationDetails: { quotationId: quotation._id, rfqId: rfq._id, unitPrice: quotation.unitPrice, currency: quotation.currency, minimumOrderQuantity: quotation.minimumOrderQuantity, leadTime: quotation.leadTime, status: quotation.status, actionUrl: `/quotations/${quotation._id}` } });
  chat.lastMessage = content; chat.lastMessageAt = new Date();
  if (String(receiverId) === String(rfq.buyerId)) chat.buyerUnreadCount += 1; else chat.sellerUnreadCount += 1;
  await chat.save();
  const io = getIO(); if (io) io.to(`chat_${chat._id}`).emit('quotation_updated', { quotationId: quotation._id, rfqId: rfq._id, status: quotation.status });
}
