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

// ─── Seller Eligibility ────────────────────────────────────
async function sellerCanQuote(rfq, seller, sellerUserId) {
  if (!seller?.isActive || seller.isSuspended) return false;
  if (!OPEN_RFQ_STATUSES.includes(rfq.status)) return false;

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
  const {
    rfqId,
    unitPrice,
    totalPrice,
    currency,
    minimumOrderQuantity,
    suppliedQuantity,
    leadTime,
    leadTimeUnit,
    paymentTerms,
    advanceRequired,
    incoterms,
    shippingCost,
    shippingEstimate,
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

  if (!rfqId || !unitPrice || minimumOrderQuantity === undefined || !leadTime) {
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
    unitPrice,
    totalPrice:
      totalPrice || unitPrice * (suppliedQuantity || minimumOrderQuantity),
    currency: currency || 'INR',
    minimumOrderQuantity,
    suppliedQuantity,
    leadTime,
    leadTimeUnit: leadTimeUnit || 'days',
    paymentTerms: paymentTerms || 'negotiable',
    advanceRequired: advanceRequired || 0,
    incoterms,
    shippingCost: shippingCost || 0,
    shippingEstimate: shippingEstimate || null,
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
    status: 'pending',
    negotiationHistory: [
      {
        action: 'submitted',
        actorId: session.userId,
        message: sellerMessage || notes || 'Quotation submitted.',
        unitPrice,
        totalPrice:
          totalPrice || unitPrice * (suppliedQuantity || minimumOrderQuantity),
        minimumOrderQuantity,
        suppliedQuantity,
        leadTime,
        leadTimeUnit: leadTimeUnit || 'days',
      },
    ],
  });

  // Update RFQ
  rfq.quotationCount = (rfq.quotationCount || 0) + 1;
  if (!rfq.repliedBySellerIds.some((id) => id.toString() === session.userId)) {
    rfq.repliedBySellerIds.push(session.userId);
    rfq.status = ['viewed', 'pending', 'active'].includes(rfq.status)
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

  await quotationRepository.createMessage({
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
    paymentTerms,
    advanceRequired,
    incoterms,
    shippingCost,
    shippingEstimate,
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
    paymentTerms: paymentTerms || 'negotiable',
    advanceRequired: advanceRequired || 0,
    incoterms,
    shippingCost: shippingCost || 0,
    shippingEstimate: shippingEstimate || existingQuotation.shippingEstimate,
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

  return { quotation };
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

  // Buyer actions: request_revision, counter_offer
  if (action === 'request_revision' || action === 'counter_offer') {
    const rfq = await quotationRepository.findRfqById(quotation.rfqId);
    if (!rfq || rfq.buyerId.toString() !== session.userId) {
      const error = new Error('Only RFQ creator can negotiate this quotation');
      error.statusCode = 403;
      throw error;
    }

    quotation.status =
      action === 'counter_offer' ? 'countered' : 'revision_requested';

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

    Object.entries(counterFields).forEach(([key, value]) => {
      if (action === 'counter_offer' && value !== undefined && value !== '') {
        quotation[key] = value;
      }
    });

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
    !['pending', 'negotiating', 'revision_requested', 'revised'].includes(
      quotation.status
    )
  ) {
    const error = new Error('Can only update open quotations');
    error.statusCode = 400;
    throw error;
  }

  const allowedFields = [
    'unitPrice', 'totalPrice', 'leadTime', 'leadTimeUnit',
    'paymentTerms', 'advanceRequired', 'minimumOrderQuantity',
    'suppliedQuantity', 'incoterms', 'shippingCost', 'shippingEstimate',
    'pricingTiers', 'description', 'specifications',
    'customizationAvailable', 'customizationDetails', 'notes',
    'sellerMessage', 'attachments',
  ];

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
    reason: body.reason || 'Seller revision',
    pricingTiers: quotation.pricingTiers,
    shippingEstimate: quotation.shippingEstimate,
  });

  Object.keys(body).forEach((key) => {
    if (allowedFields.includes(key)) {
      quotation[key] = body[key];
    }
  });

  quotation.revisionNumber += 1;
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

  await quotation.save();

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
  if (action === 'accept' && quotation.status === 'accepted' && quotation.tradeOrderId) {
    const existingOrder = await quotationRepository.findOrderByQuotationId(quotationId);
    return {
      quotation,
      tradeOrder: existingOrder,
      reused: true,
      message: 'Quotation already accepted',
    };
  }

  const previousStatus = quotation.status;
  if (
    !['pending', 'submitted', 'negotiating', 'countered', 'revision_requested', 'revised'].includes(
      previousStatus
    )
  ) {
    const error = new Error(
      `Quotation cannot be ${action}ed from ${quotation.status} status`
    );
    error.statusCode = 409;
    throw error;
  }

  if (action === 'accept') {
    quotation.status = 'accepted';
    quotation.acceptedAt = new Date();
    quotation.rejectedAt = null;
    quotation.rejectionReason = null;
    quotation.negotiationHistory.push({
      action: 'accepted',
      actorId: session.userId,
      message: 'Buyer accepted the quotation.',
    });
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

  let tradeOrder = null;

  if (action === 'accept') {
    const rfq = quotation.rfqId;
    const product =
      quotation.productId ||
      (rfq.productId
        ? await quotationRepository.findProductById(rfq.productId)
        : null);
    const buyer = await quotationRepository.findUserById(rfq.buyerId);
    const sellerUser = await quotationRepository.findUserById(quotation.userId);
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
        buyerId: rfq.buyerId,
        sellerId: quotation.userId,
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
        timeline: [
          {
            status: 'pending_approval',
            timestamp: new Date(),
            note: 'Trade order created from accepted quotation',
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

    quotation.status = 'won';
    await quotation.save();

    // Create order message
    if (tradeOrder.chatId) {
      await quotationRepository.createMessage({
        chatId: tradeOrder.chatId,
        senderId: session.userId,
        receiverId: quotation.userId,
        content: `Quotation accepted. Trade order ${tradeOrder.orderNumber} has been created.`,
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
      title: 'Quotation accepted',
      description: `The buyer accepted your quotation for ${rfq.title}.`,
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

  return { quotation, tradeOrder, message: `Quotation ${action}ed successfully` };
}