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
import { normalizeCurrency } from '../lib/currency-metadata.js';
import { getIO } from '../lib/socket.js';
import { allowedActions, assertTransition, lifecycleSnapshot, recordTransition } from './business-lifecycle.service.js';
import { createTradeDocument } from './trade-artifact.service.js';
import { commercialNumber, resolveOfferTotals } from '../lib/quotation-commerce.js';

const NEGOTIABLE_QUOTATION_STATUSES = new Set(['draft', 'pending', 'submitted', 'negotiating', 'countered', 'revision_requested', 'revised']);

function normalizedTaxonomy(value) {
  const resolved = typeof value === 'object' && value
    ? value.name || value.label || value.slug || value.title || ''
    : value;
  return String(resolved || '').trim().toLowerCase();
}

export function sellerMatchesRfqTaxonomy(seller, rfq) {
  const category = normalizedTaxonomy(rfq?.category);
  const subcategory = normalizedTaxonomy(rfq?.subcategory);
  const categories = (seller?.productCategories || []).map(normalizedTaxonomy).filter(Boolean);
  const subcategories = (seller?.productSubcategories || []).map(normalizedTaxonomy).filter(Boolean);
  return Boolean(category && categories.includes(category) && (!subcategory || subcategories.includes(subcategory)));
}

export function productMatchesRfqTaxonomy(product, rfq) {
  return Boolean(
    normalizedTaxonomy(product?.category) &&
    normalizedTaxonomy(product?.category) === normalizedTaxonomy(rfq?.category) &&
    (!normalizedTaxonomy(rfq?.subcategory) || normalizedTaxonomy(product?.subcategory) === normalizedTaxonomy(rfq?.subcategory))
  );
}

export function quotationCurrentOffer(quotation) {
  if (quotation.currentOffer?.unitPrice) return quotation.currentOffer.toObject?.() || quotation.currentOffer;
  const history = [...(quotation.negotiationHistory || [])].reverse().find((entry) => Number(entry.unitPrice) > 0);
  if (history) return history.toObject?.() || history;
  return {
    action: 'submitted', actorId: quotation.userId?._id || quotation.userId, actorRole: 'seller',
    unitPrice: quotation.unitPrice, totalPrice: quotation.totalPrice,
    minimumOrderQuantity: quotation.minimumOrderQuantity, suppliedQuantity: quotation.suppliedQuantity,
    leadTime: quotation.leadTime, leadTimeUnit: quotation.leadTimeUnit,
    paymentTerms: quotation.paymentTerms, incoterms: quotation.incoterms,
    notes: quotation.sellerMessage || quotation.notes, createdAt: quotation.createdAt, sequence: 1,
  };
}

export function resolveProductConfiguration(quotation, fallbackProduct = null) {
  const history = Array.isArray(quotation?.productConfigurationHistory) ? quotation.productConfigurationHistory : [];
  const latestHistoryEntry = history.length ? history[history.length - 1] : null;
  const historySnapshot = latestHistoryEntry?.snapshot && typeof latestHistoryEntry.snapshot === 'object'
    ? latestHistoryEntry.snapshot
    : null;
  const currentConfig = quotation?.productConfiguration && typeof quotation.productConfiguration === 'object'
    ? quotation.productConfiguration
    : {};
  const productValues = {
    ...(fallbackProduct && typeof fallbackProduct === 'object' ? fallbackProduct : {}),
    ...(historySnapshot || {}),
    ...(currentConfig || {}),
  };

  const resolved = {
    productId: quotation?.productId || fallbackProduct?._id || fallbackProduct?.id || null,
    name: productValues.name || productValues.productName || fallbackProduct?.name || quotation?.title || '',
    image: productValues.image || productValues.imageUrl || fallbackProduct?.images?.[0] || fallbackProduct?.image || '',
    description: productValues.description || fallbackProduct?.description || quotation?.description || '',
    specifications: productValues.specifications || fallbackProduct?.specifications || quotation?.specifications || '',
    material: productValues.material || '',
    size: productValues.size || '',
    dimensions: productValues.dimensions || '',
    color: productValues.color || '',
    finish: productValues.finish || '',
    grade: productValues.grade || productValues.model || '',
    customization: productValues.customization || '',
    packaging: productValues.packaging || '',
    quantity: Number(productValues.quantity ?? quotation?.suppliedQuantity ?? fallbackProduct?.stockQuantity ?? 1) || 1,
    minimumOrderQuantity: Number(productValues.minimumOrderQuantity ?? quotation?.minimumOrderQuantity ?? fallbackProduct?.minimumOrderQuantity ?? 1) || 1,
    unitPrice: Number(productValues.unitPrice ?? quotation?.unitPrice ?? fallbackProduct?.price ?? 0) || 0,
    currency: productValues.currency || quotation?.currency || fallbackProduct?.currency || 'INR',
    leadTime: Number(productValues.leadTime ?? quotation?.leadTime ?? fallbackProduct?.leadTime?.value ?? 0) || 0,
    leadTimeUnit: productValues.leadTimeUnit || quotation?.leadTimeUnit || fallbackProduct?.leadTime?.unit || 'days',
    paymentTerms: productValues.paymentTerms || quotation?.paymentTerms || fallbackProduct?.paymentTerms || 'negotiable',
    shippingTerms: productValues.shippingTerms || quotation?.shippingTerms || '',
    customNotes: productValues.customNotes || productValues.notes || quotation?.sellerMessage || quotation?.notes || '',
    ...productValues,
  };

  return resolved;
}

async function expireQuotationIfNeeded(quotation) {
  if (quotation.expiryDate && new Date(quotation.expiryDate) <= new Date() && NEGOTIABLE_QUOTATION_STATUSES.has(quotation.status)) {
    const previousStatus = quotation.status;
    quotation.previousStatus = previousStatus;
    quotation.status = 'expired';
    quotation.negotiationVersion = Number(quotation.negotiationVersion || 0) + 1;
    quotation.negotiationHistory.push({ action: 'expired', actorRole: 'seller', actorId: quotation.userId?._id || quotation.userId, message: 'Quotation validity period expired.', notes: 'Quotation validity period expired.', previousUnitPrice: quotationCurrentOffer(quotation).unitPrice, status: 'expired' });
    quotation.activityTimeline.push({ action: 'quotation_expired', status: 'expired', message: 'Quotation validity period expired', actorId: quotation.userId?._id || quotation.userId, actorRole: 'seller' });
    await quotation.save();
    const rfq = await quotationRepository.findRfqById(quotation.rfqId?._id || quotation.rfqId).catch(() => null);
    if (rfq) {
      const eventKey = `quotation-expired:${quotation._id}`;
      await quotationRepository.createNotification({ eventKey, userId: rfq.buyerId, notificationType: 'quotation_expired', title: 'Quotation expired', description: 'This quotation passed its validity date.', data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}` }, priority: 'medium' }).catch(() => null);
      await publishQuotationContext({ quotation, rfq, actorId: quotation.userId?._id || quotation.userId, receiverId: rfq.buyerId, deliveryKey: eventKey, content: `Quotation expired\nView quotation: /quotations/${quotation._id}` }).catch(() => null);
    }
    return true;
  }
  return false;
}

async function assertFreshNegotiation(quotation, body = {}) {
  if (await expireQuotationIfNeeded(quotation)) {
    throw Object.assign(new Error('This quotation has expired'), { statusCode: 409 });
  }
  const idempotencyKey = String(body.idempotencyKey || '').trim();
  const existing = idempotencyKey && quotation.negotiationHistory?.find((entry) => entry.idempotencyKey === idempotencyKey);
  if (!existing && body.expectedNegotiationVersion !== undefined && Number(body.expectedNegotiationVersion) !== Number(quotation.negotiationVersion || 0)) {
    throw Object.assign(new Error('This quotation has been updated. Please refresh to see the latest offer.'), { statusCode: 409, staleQuotation: true });
  }
  return { idempotencyKey, existing };
}

function nextOffer(quotation, input, { action, actorId, actorRole, notes, previousUnitPrice }) {
  const unitPrice = input.unitPrice === undefined || input.unitPrice === ''
    ? quotationCurrentOffer(quotation).unitPrice || quotation.unitPrice
    : commercialNumber(input.unitPrice, 'Unit price', { minimum: Number.EPSILON });
  const suppliedQuantity = input.suppliedQuantity === undefined || input.suppliedQuantity === ''
    ? quotation.suppliedQuantity
    : commercialNumber(input.suppliedQuantity, 'Quantity', { minimum: Number.EPSILON });
  const minimumOrderQuantity = input.minimumOrderQuantity === undefined || input.minimumOrderQuantity === ''
    ? quotation.minimumOrderQuantity
    : commercialNumber(input.minimumOrderQuantity, 'Minimum order quantity', { minimum: Number.EPSILON });
  const resolvedLeadTime = input.leadTime === undefined || input.leadTime === ''
    ? quotation.leadTime
    : commercialNumber(input.leadTime, 'Lead time', { minimum: Number.EPSILON });
  const totals = resolveOfferTotals(quotation, { ...input, unitPrice, suppliedQuantity, minimumOrderQuantity });
  return {
    action, actorId, actorRole, unitPrice,
    productSubtotal: totals.productSubtotal,
    shippingCost: totals.shippingCost,
    taxAmount: totals.taxAmount,
    totalPrice: totals.finalTotal,
    minimumOrderQuantity, suppliedQuantity,
    leadTime: resolvedLeadTime,
    leadTimeUnit: input.leadTimeUnit || quotation.leadTimeUnit,
    paymentTerms: input.paymentTerms || quotation.paymentTerms,
    incoterms: input.incoterms || quotation.incoterms,
    notes: notes || '', previousUnitPrice,
    createdAt: new Date(), sequence: Number(quotation.negotiationVersion || 0) + 1,
  };
}

// ─── Seller Eligibility ────────────────────────────────────
async function sellerCanQuote(rfq, seller, sellerUserId, linkedProduct = null) {
  if (!seller?.isActive || seller.isSuspended) return false;
  if (!OPEN_RFQ_STATUSES.includes(rfq.status)) return false;

  if (rfq.visibility === 'private') {
    const sellerAccepted = rfq.status === 'seller_accepted' || rfq.repliedBySellerIds?.some(value => idMatches(value, sellerUserId)) || rfq.activityTimeline?.some(event => event.action === 'seller_accept' && idMatches(event.actorId, sellerUserId));
    if (!sellerAccepted) return false;
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
  return sellerMatchesRfqTaxonomy(seller, rfq) || productMatchesRfqTaxonomy(linkedProduct, rfq);
}

// ─── Get Quotations ────────────────────────────────────────
export async function getQuotations(session, searchParams) {
  const {
    rfqId,
    productId: offeredProductId,
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
  if (scope === 'buyer' || (!scope && session.roles?.includes(USER_ROLES.BUYER) && !session.roles?.includes(USER_ROLES.SELLER))) {
    query.status = status && status !== 'draft' ? status : { $ne: 'draft' };
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
    productId: offeredProductId,
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
    productConfiguration,
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
  const numericUnitPrice = Number(unitPrice || 0);
  const numericMoq = Number(minimumOrderQuantity || 0);
  const numericAvailableQuantity = Number(suppliedQuantity || 0);
  const numericLeadTime = Number(leadTime || 0);
  if (!saveAsDraft && (
    !Number.isFinite(numericUnitPrice) || numericUnitPrice <= 0 ||
    !Number.isFinite(numericMoq) || numericMoq <= 0 ||
    !Number.isFinite(numericAvailableQuantity) || numericAvailableQuantity <= 0 ||
    !Number.isFinite(numericLeadTime) || numericLeadTime <= 0
  )) {
    throw Object.assign(new Error('Unit price, MOQ, available quantity, and lead time must be valid positive numbers'), { statusCode: 422 });
  }
  const submittedTotals = saveAsDraft ? null : resolveOfferTotals({
    unitPrice: numericUnitPrice,
    suppliedQuantity: numericAvailableQuantity,
    minimumOrderQuantity: numericMoq,
    shippingCost: shippingCost ?? 0,
    taxes: taxes || {},
  });
  const resolvedCurrency = normalizeCurrency(currency || 'INR');

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
    const error = new Error('Manufacturer profile not found');
    error.statusCode = 404;
    throw error;
  }

  const rfqProduct = rfq.productId
    ? await quotationRepository.findProductById(rfq.productId)
    : null;
  const manufacturerOwnsRfqProduct = Boolean(
    rfqProduct && idMatches(rfqProduct.sellerId, seller._id)
  );

  let offeredProduct = null;
  if (offeredProductId) {
    if (!mongoose.Types.ObjectId.isValid(offeredProductId)) {
      throw Object.assign(new Error('Select a valid manufacturer product for this quotation'), { statusCode: 422 });
    }
    offeredProduct = await quotationRepository.findProductById(offeredProductId);
    if (!offeredProduct || !idMatches(offeredProduct.sellerId, seller._id) || !['published', 'active'].includes(offeredProduct.status)) {
      throw Object.assign(new Error('The selected product is not an active product from your manufacturer catalogue'), { statusCode: 403 });
    }
  }

  // A private, product-specific RFQ can reuse the requested product when it
  // belongs to the invited manufacturer. Public marketplace respondents must
  // link a product from their own catalogue so checkout never points at a
  // different manufacturer's listing.
  const quotationProductId = manufacturerOwnsRfqProduct
    ? rfqProduct._id
    : offeredProduct?._id;
  if (!quotationProductId && !saveAsDraft) {
    throw Object.assign(new Error('Select the manufacturer product linked to this quotation so accepted terms can continue to checkout'), { statusCode: 422 });
  }

  if (!(await sellerCanQuote(rfq, seller, session.userId, offeredProduct || (manufacturerOwnsRfqProduct ? rfqProduct : null)))) {
    const error = new Error('You are not eligible to quote this RFQ');
    error.statusCode = 403;
    throw error;
  }

  const normalizedProductConfiguration = {
    ...((productConfiguration && typeof productConfiguration === 'object') ? productConfiguration : {}),
    productId: quotationProductId || offeredProduct?._id || rfq.productId || null,
    name: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.name) || offeredProduct?.name || rfq.title || 'Configured product',
    image: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.image) || offeredProduct?.images?.[0] || rfq.images?.[0]?.url || '',
    description: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.description) || description || offeredProduct?.description || rfq.description || '',
    specifications: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.specifications) || specifications || offeredProduct?.specifications || rfq.specifications || '',
    quantity: Number(((productConfiguration && typeof productConfiguration === 'object' ? productConfiguration.quantity : suppliedQuantity) ?? numericAvailableQuantity ?? rfq.quantity ?? 1)) || 1,
    minimumOrderQuantity: Number(((productConfiguration && typeof productConfiguration === 'object' ? productConfiguration.minimumOrderQuantity : minimumOrderQuantity) ?? numericMoq ?? offeredProduct?.minimumOrderQuantity ?? rfq.minimumOrderQuantity ?? 1)) || 1,
    unitPrice: Number(((productConfiguration && typeof productConfiguration === 'object' ? productConfiguration.unitPrice : unitPrice) ?? numericUnitPrice ?? 0)) || 0,
    currency: normalizeCurrency((productConfiguration && typeof productConfiguration === 'object' && productConfiguration.currency) || currency || rfq.currency || 'INR'),
    leadTime: Number(((productConfiguration && typeof productConfiguration === 'object' ? productConfiguration.leadTime : leadTime) ?? numericLeadTime ?? 0)) || 0,
    leadTimeUnit: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.leadTimeUnit) || leadTimeUnit || 'days',
    paymentTerms: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.paymentTerms) || paymentTerms || 'negotiable',
    shippingTerms: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.shippingTerms) || shippingTerms || '',
    packaging: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.packaging) || packaging || '',
    customNotes: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.customNotes) || sellerMessage || notes || '',
  };

  const creationIdempotencyKey = String(body.idempotencyKey || '').trim();
  if (creationIdempotencyKey) {
    const replayedQuotation = await quotationRepository.findQuotationByIdempotencyKey(session.userId, creationIdempotencyKey);
    if (replayedQuotation) return { quotation: replayedQuotation, reused: true, message: 'This quotation request was already processed' };
  }

  // Check for existing quotation - revise if found
  const existingQuotation = await quotationRepository.findExistingQuotation(
    rfqId,
    session.userId
  );

  if (existingQuotation) {
    if (!existingQuotation.productId && quotationProductId) {
      existingQuotation.productId = quotationProductId;
      await existingQuotation.save();
    }
    return reviseExistingQuotation(
      existingQuotation,
      session,
      seller,
      rfq,
      body
    );
  }

  // Create new quotation
  let quotation;
  try {
    quotation = await quotationRepository.createQuotation({
    idempotencyKey: creationIdempotencyKey || undefined,
    rfqId,
    productId: quotationProductId || null,
    sellerId: seller._id,
    userId: session.userId,
    unitPrice: numericUnitPrice,
    totalPrice: submittedTotals?.finalTotal || 0,
    currency: resolvedCurrency,
    minimumOrderQuantity: Number(minimumOrderQuantity || 1),
    suppliedQuantity: Number(suppliedQuantity || minimumOrderQuantity || 1),
    leadTime: Number(leadTime || 1),
    leadTimeUnit: leadTimeUnit || 'days',
    productionTime: Number(productionTime || leadTime || 0),
    productionTimeUnit: productionTimeUnit || leadTimeUnit || 'days',
    paymentTerms: paymentTerms || 'negotiable',
    advanceRequired: advanceRequired || 0,
    incoterms,
    shippingCost: submittedTotals?.shippingCost || 0,
    shippingEstimate: shippingEstimate || null,
    shippingTerms,
    packaging,
    samplePrice: Number(samplePrice || 0),
    taxes: { ...(taxes || {}), amount: submittedTotals?.taxAmount || 0 },
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
    productConfiguration: normalizedProductConfiguration,
    productConfigurationHistory: [{
      version: 1,
      createdAt: new Date(),
      changedFields: Object.keys(normalizedProductConfiguration),
      snapshot: normalizedProductConfiguration,
    }],
    directOrderEnabled: false,
    status: saveAsDraft ? 'draft' : 'submitted',
    negotiationVersion: saveAsDraft ? 0 : 1,
    ...(!saveAsDraft ? { currentOffer: {
      action: 'submitted', actorId: session.userId, actorRole: 'seller', unitPrice: numericUnitPrice,
      productSubtotal: submittedTotals.productSubtotal,
      shippingCost: submittedTotals.shippingCost,
      taxAmount: submittedTotals.taxAmount,
      totalPrice: submittedTotals.finalTotal,
      minimumOrderQuantity: numericMoq, suppliedQuantity: numericAvailableQuantity,
      leadTime: numericLeadTime, leadTimeUnit: leadTimeUnit || 'days', paymentTerms: paymentTerms || 'negotiable',
      incoterms, notes: sellerMessage || notes || '', createdAt: new Date(), sequence: 1,
    } } : {}),
    activityTimeline: [{ action: saveAsDraft ? 'draft_saved' : 'quotation_sent', status: saveAsDraft ? 'draft' : 'submitted', message: sellerMessage || notes || 'Quotation prepared', actorId: session.userId, actorRole: 'seller' }],
    negotiationHistory: [
      {
        action: saveAsDraft ? 'message' : 'submitted',
        actorRole: 'seller',
        actorId: session.userId,
        idempotencyKey: String(body.idempotencyKey || '').trim() || undefined,
        message: sellerMessage || notes || 'Quotation submitted.',
        unitPrice: Number(unitPrice || 0),
        totalPrice: submittedTotals?.finalTotal || 0,
        minimumOrderQuantity: Number(minimumOrderQuantity || 1),
        suppliedQuantity,
        leadTime: Number(leadTime || 1),
        leadTimeUnit: leadTimeUnit || 'days',
      },
    ],
    });
  } catch (error) {
    if (error?.code !== 11000 || !creationIdempotencyKey) throw error;
    const replayedQuotation = await quotationRepository.findQuotationByIdempotencyKey(session.userId, creationIdempotencyKey);
    if (!replayedQuotation) throw error;
    return { quotation: replayedQuotation, reused: true, message: 'This quotation request was already processed' };
  }

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
      actionUrl: `/rfqs/${rfq._id}`,
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
      actionUrl: `/quotations/${quotation._id}`,
    },
  });

  chat.lastMessage = messageContent;
  chat.lastMessageAt = new Date();
  chat.buyerUnreadCount += 1;
  await chat.save();

  // Notify buyer
  await quotationRepository.createNotification({
    eventKey: `quotation-submitted:${quotation._id}:${rfq.buyerId}`,
    userId: rfq.buyerId,
    notificationType: 'quotation_received',
    title: 'New quotation received',
    description: `${seller.companyName || 'A manufacturer'} quoted ${quotation.currency} ${quotation.unitPrice} per unit for ${rfq.title}`,
    data: {
      relatedId: quotation._id,
      relatedModel: 'Quotation',
      actionUrl: `/quotations/${quotation._id}`,
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

  const freshness = await assertFreshNegotiation(existingQuotation, body);
  if (freshness.existing) return { quotation: existingQuotation, reused: true, message: 'This negotiation action was already processed' };
  const previousOffer = quotationCurrentOffer(existingQuotation);

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

  const previousConfiguration = resolveProductConfiguration(existingQuotation);
  const revisionUnitPrice = commercialNumber(unitPrice, 'Unit price', { minimum: Number.EPSILON });
  const revisionMoq = commercialNumber(minimumOrderQuantity, 'Minimum order quantity', { minimum: Number.EPSILON });
  const revisionQuantity = commercialNumber(suppliedQuantity, 'Available quantity', { minimum: Number.EPSILON });
  const revisionLeadTime = commercialNumber(leadTime, 'Lead time', { minimum: Number.EPSILON });
  const nextProductConfiguration = {
    ...(previousConfiguration || {}),
    ...(productConfiguration && typeof productConfiguration === 'object' ? productConfiguration : {}),
    productId: existingQuotation.productId || rfq.productId || null,
    name: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.name) || previousConfiguration.name || existingQuotation.description || rfq.title || 'Configured product',
    image: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.image) || previousConfiguration.image || '',
    description: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.description) || description || previousConfiguration.description || existingQuotation.description || rfq.description || '',
    specifications: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.specifications) || specifications || previousConfiguration.specifications || existingQuotation.specifications || rfq.specifications || '',
    quantity: Number(((productConfiguration && typeof productConfiguration === 'object' ? productConfiguration.quantity : suppliedQuantity) ?? revisionQuantity ?? previousConfiguration.quantity ?? existingQuotation.suppliedQuantity ?? rfq.quantity ?? 1)) || 1,
    minimumOrderQuantity: Number(((productConfiguration && typeof productConfiguration === 'object' ? productConfiguration.minimumOrderQuantity : minimumOrderQuantity) ?? revisionMoq ?? previousConfiguration.minimumOrderQuantity ?? existingQuotation.minimumOrderQuantity ?? rfq.minimumOrderQuantity ?? 1)) || 1,
    unitPrice: Number(((productConfiguration && typeof productConfiguration === 'object' ? productConfiguration.unitPrice : unitPrice) ?? revisionUnitPrice ?? previousConfiguration.unitPrice ?? existingQuotation.unitPrice ?? 0)) || 0,
    currency: normalizeCurrency((productConfiguration && typeof productConfiguration === 'object' && productConfiguration.currency) || currency || previousConfiguration.currency || existingQuotation.currency || rfq.currency || 'INR'),
    leadTime: Number(((productConfiguration && typeof productConfiguration === 'object' ? productConfiguration.leadTime : leadTime) ?? revisionLeadTime ?? previousConfiguration.leadTime ?? existingQuotation.leadTime ?? 0)) || 0,
    leadTimeUnit: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.leadTimeUnit) || leadTimeUnit || previousConfiguration.leadTimeUnit || existingQuotation.leadTimeUnit || 'days',
    paymentTerms: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.paymentTerms) || paymentTerms || previousConfiguration.paymentTerms || existingQuotation.paymentTerms || 'negotiable',
    shippingTerms: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.shippingTerms) || shippingTerms || previousConfiguration.shippingTerms || existingQuotation.shippingTerms || '',
    packaging: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.packaging) || packaging || previousConfiguration.packaging || existingQuotation.packaging || '',
    customNotes: (productConfiguration && typeof productConfiguration === 'object' && productConfiguration.customNotes) || sellerMessage || notes || previousConfiguration.customNotes || existingQuotation.sellerMessage || '',
  };
  const revisionTotals = resolveOfferTotals(existingQuotation, {
    unitPrice: revisionUnitPrice,
    minimumOrderQuantity: revisionMoq,
    suppliedQuantity: revisionQuantity,
    shippingCost: shippingCost ?? existingQuotation.shippingCost,
    taxes: taxes ?? existingQuotation.taxes,
  });

  // Save revision history
  const changedConfigurationFields = Object.keys(nextProductConfiguration).filter((key) => JSON.stringify(nextProductConfiguration[key]) !== JSON.stringify(previousConfiguration[key]));
  existingQuotation.productConfiguration = nextProductConfiguration;
  existingQuotation.productConfigurationHistory.push({
    version: (existingQuotation.productConfigurationHistory?.length || 0) + 1,
    createdAt: new Date(),
    changedFields: changedConfigurationFields,
    snapshot: nextProductConfiguration,
  });

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
    reason: 'Manufacturer revised quotation',
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
    unitPrice: revisionUnitPrice,
    totalPrice:
      revisionTotals.finalTotal,
    currency: normalizeCurrency(currency || existingQuotation.currency || 'INR'),
    minimumOrderQuantity: revisionMoq,
    suppliedQuantity: revisionQuantity,
    leadTime: revisionLeadTime,
    leadTimeUnit: leadTimeUnit || 'days',
    productionTime: productionTime ?? existingQuotation.productionTime,
    productionTimeUnit: productionTimeUnit || existingQuotation.productionTimeUnit || 'days',
    paymentTerms: paymentTerms || 'negotiable',
    advanceRequired: advanceRequired || 0,
    incoterms,
    shippingCost: revisionTotals.shippingCost,
    shippingEstimate: shippingEstimate || existingQuotation.shippingEstimate,
    shippingTerms: shippingTerms ?? existingQuotation.shippingTerms,
    packaging: packaging ?? existingQuotation.packaging,
    samplePrice: samplePrice ?? existingQuotation.samplePrice,
    taxes: { ...(taxes ?? existingQuotation.taxes?.toObject?.() ?? existingQuotation.taxes ?? {}), amount: revisionTotals.taxAmount },
    specialClauses: specialClauses ?? existingQuotation.specialClauses,
    pricingTiers: pricingTiers || existingQuotation.pricingTiers || [],
    description,
    specifications,
    certifications: certifications || [],
    customizationAvailable: customizationAvailable || false,
    customizationDetails,
    notes,
    sellerMessage,
    directOrderEnabled: false,
    expiryDate: expiryDate || existingQuotation.expiryDate,
    attachments: attachments || existingQuotation.attachments || [],
    status:
      existingQuotation.status === 'revision_requested' ||
      existingQuotation.status === 'countered'
        ? 'revised'
        : 'negotiating',
  });

  existingQuotation.revisionNumber += 1;
  existingQuotation.negotiationVersion = Number(existingQuotation.negotiationVersion || 0) + 1;
  existingQuotation.currentOffer = nextOffer(existingQuotation, existingQuotation, {
    action: 'seller_revision', actorId: session.userId, actorRole: 'seller',
    notes: sellerMessage || notes || 'Manufacturer revised the quotation.', previousUnitPrice: previousOffer.unitPrice,
  });
  existingQuotation.negotiationHistory.push({
    action: 'seller_revision',
    idempotencyKey: freshness.idempotencyKey || undefined,
    actorId: session.userId,
    actorRole: 'seller',
    message: sellerMessage || notes || 'Manufacturer revised the quotation.',
    previousUnitPrice: previousOffer.unitPrice,
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
  const actionKey = freshness.idempotencyKey || `${existingQuotation.negotiationVersion}`;
  await quotationRepository.createNotification({
    eventKey: `quotation-revised:${existingQuotation._id}:${actionKey}`,
    userId: rfq.buyerId,
    notificationType: 'quotation_revised',
    title: 'Quotation revised',
    description: `${seller.companyName || 'A manufacturer'} revised a quotation for ${rfq.title}`,
    data: {
      relatedId: existingQuotation._id,
      relatedModel: 'Quotation',
      actionUrl: `/quotations/${existingQuotation._id}`,
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

  const revisionChatMessage = await quotationRepository.createMessageOnce({
    deliveryKey: `quotation-revised:${existingQuotation._id}:${actionKey}`,
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
      actionUrl: `/quotations/${existingQuotation._id}`,
    },
  });

  chat.lastMessage = revisionMessage;
  chat.lastMessageAt = new Date();
  chat.buyerUnreadCount += 1;
  await chat.save();

  const io = getIO();
  if (io) {
    io.to(`chat_${chat._id}`).emit('new_message', revisionChatMessage);
    io.to(`user_${rfq.buyerId}`).emit('quotation_updated', { quotationId: existingQuotation._id, rfqId: rfq._id, status: existingQuotation.status });
  }

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
  const isBuyer = quotation.rfqId.buyerId.toString() === session.userId;
  const isAuthorized =
    (isBuyer && quotation.status !== 'draft') ||
    quotation.userId._id.toString() === session.userId;

  if (!isAuthorized) {
    const error = new Error('Unauthorized');
    error.statusCode = 403;
    throw error;
  }
  if (await expireQuotationIfNeeded(quotation)) quotation = await quotationRepository.findQuotationById(quotationId);

  const actorRole = quotation.rfqId.buyerId.toString() === session.userId ? 'buyer' : 'seller';
  const result = quotation.toObject();
  result.currentOffer = quotationCurrentOffer(quotation);
  result.negotiationVersion = Number(quotation.negotiationVersion || 0);
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

  const authorizationRfq = await quotationRepository.findRfqById(quotation.rfqId);
  if (quotation.userId.toString() !== session.userId && authorizationRfq?.buyerId?.toString() !== session.userId) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
  }

  const freshness = await assertFreshNegotiation(quotation, body);
  if (freshness.existing) return { quotation, reused: true, message: 'This negotiation action was already processed' };

  if (action === 'withdraw' || action === 'send') {
    if (quotation.userId.toString() !== session.userId) { const error = new Error('Unauthorized'); error.statusCode = 403; throw error; }
    if (action === 'withdraw' && !['draft','pending','submitted','negotiating','countered','revision_requested','revised'].includes(quotation.status)) { const error = new Error('Quotation can no longer be withdrawn'); error.statusCode = 409; throw error; }
    if (action === 'send' && quotation.status !== 'draft') { const error = new Error('Only a draft quotation can be sent'); error.statusCode = 409; throw error; }
    quotation.status = action === 'withdraw' ? 'withdrawn' : 'submitted';
    if (action === 'withdraw') {
      quotation.negotiationVersion = Number(quotation.negotiationVersion || 0) + 1;
      quotation.negotiationHistory.push({ action: 'withdrawn', idempotencyKey: freshness.idempotencyKey || undefined, actorId: session.userId, actorRole: 'seller', message: reason || 'Seller withdrew the quotation.', notes: reason || 'Seller withdrew the quotation.', previousUnitPrice: quotationCurrentOffer(quotation).unitPrice, status: 'withdrawn' });
    }
    if (action === 'send') {
      quotation.negotiationVersion = Number(quotation.negotiationVersion || 0) + 1;
      quotation.currentOffer = nextOffer(quotation, quotation, { action: 'submitted', actorId: session.userId, actorRole: 'seller', notes: reason || body.sellerMessage || 'Quotation submitted.', previousUnitPrice: undefined });
      quotation.negotiationHistory.push({ ...quotation.currentOffer.toObject?.() || quotation.currentOffer, idempotencyKey: freshness.idempotencyKey || undefined, message: reason || body.sellerMessage || 'Quotation submitted.' });
    }
    quotation.activityTimeline.push({ action: action === 'withdraw' ? 'quotation_withdrawn' : 'quotation_sent', status: quotation.status, message: reason || body.sellerMessage || `Quotation ${action}`, actorId: session.userId, actorRole: 'seller' });
    await quotation.save();
    if (action === 'withdraw') {
      const rfq = await quotationRepository.findRfqById(quotation.rfqId);
      if (rfq) {
        const actionKey = freshness.idempotencyKey || `${quotation.negotiationVersion}`;
        await quotationRepository.createNotification({ eventKey: `quotation-withdrawn:${quotation._id}:${actionKey}`, userId: rfq.buyerId, notificationType: 'quotation_cancelled', title: 'Quotation withdrawn', description: reason || 'The manufacturer withdrew this quotation.', data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}` }, priority: 'high' });
        await publishQuotationContext({ quotation, rfq, actorId: session.userId, receiverId: rfq.buyerId, deliveryKey: `quotation-withdrawn:${quotation._id}:${actionKey}`, content: `Quotation withdrawn\nReason: ${reason || 'The manufacturer withdrew this quotation.'}\nView quotation: /quotations/${quotation._id}` });
      }
    }
    if (action === 'send') {
      const rfq = await quotationRepository.findRfqById(quotation.rfqId);
      const seller = await quotationRepository.findSellerByUserId(session.userId);
      const linkedProduct = quotation.productId ? await quotationRepository.findProductById(quotation.productId) : null;
      if (!rfq || !(await sellerCanQuote(rfq, seller, session.userId, linkedProduct))) {
        quotation.status = 'draft';
        quotation.activityTimeline.pop();
        await quotation.save();
        throw Object.assign(new Error('This RFQ is no longer open for quotations'), { statusCode: 409 });
      }
      if (!rfq.repliedBySellerIds.some((value) => idMatches(value, session.userId))) {
        rfq.repliedBySellerIds.push(session.userId);
        rfq.quotationCount = Number(rfq.quotationCount || 0) + 1;
      }
      rfq.status = ['viewed', 'pending', 'active', 'submitted', 'seller_accepted', 'ready_for_quotation'].includes(rfq.status) ? 'quoted' : rfq.status;
      rfq.lastQuotedAt = new Date();
      await rfq.save();
      await quotationRepository.createNotification({
        eventKey: `quotation-submitted:${quotation._id}:${rfq.buyerId}`,
        userId: rfq.buyerId,
        notificationType: 'quotation_received',
        title: 'New quotation received',
        description: `${seller.companyName || 'A manufacturer'} submitted a quotation for ${rfq.title}`,
        data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}` },
        priority: 'high',
      });
      await publishQuotationContext({ quotation, rfq, actorId: session.userId, receiverId: rfq.buyerId, content: `Quotation submitted: ${quotation.currency} ${quotation.unitPrice} per unit, MOQ ${quotation.minimumOrderQuantity}, lead time ${quotation.leadTime} ${quotation.leadTimeUnit}.` });
    }
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
    const lockedOffer = quotationCurrentOffer(quotation);
    const lockedFields = {
      unitPrice: lockedOffer.unitPrice ?? quotation.unitPrice,
      suppliedQuantity: lockedOffer.suppliedQuantity ?? quotation.suppliedQuantity,
      minimumOrderQuantity: lockedOffer.minimumOrderQuantity ?? quotation.minimumOrderQuantity,
      leadTime: lockedOffer.leadTime ?? quotation.leadTime,
      leadTimeUnit: lockedOffer.leadTimeUnit ?? quotation.leadTimeUnit,
      paymentTerms: lockedOffer.paymentTerms ?? quotation.paymentTerms,
      incoterms: lockedOffer.incoterms ?? quotation.incoterms,
    };
    for (const [field, lockedValue] of Object.entries(lockedFields)) {
      if (body[field] !== undefined && String(body[field]) !== String(lockedValue)) {
        throw Object.assign(new Error('Accepted commercial terms are locked. Reopen negotiation to request a change.'), { statusCode: 409, field });
      }
      quotation[field] = lockedValue;
    }
    quotation.directOrderEnabled = false;
    quotation.directOrderEnabledAt = undefined;
    const finalFields = ['attachments'];
    for (const field of finalFields) if (body[field] !== undefined) quotation[field] = field === 'specialClauses' && !Array.isArray(body[field]) ? String(body[field]).split('\n').map(value => value.trim()).filter(Boolean) : body[field];
    if ([quotation.unitPrice, quotation.minimumOrderQuantity, quotation.suppliedQuantity, quotation.leadTime].some(value => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
      throw Object.assign(new Error('Final Quotation requires valid Unit Price, MOQ, Available Quantity, and Lead Time'), { statusCode: 422 });
    }
    quotation.totalPrice = resolveOfferTotals(quotation, quotation).finalTotal;
    quotation.negotiationVersion = Number(quotation.negotiationVersion || 0) + 1;
    quotation.negotiationHistory.push({
      action: 'finalized',
      idempotencyKey: freshness.idempotencyKey || undefined,
      actorId: session.userId,
      actorRole: 'seller',
      message: reason || 'Seller finalized the accepted quotation terms.',
      notes: reason || 'Seller finalized the accepted quotation terms.',
      status: nextStatus,
      unitPrice: quotation.unitPrice,
      totalPrice: quotation.totalPrice,
      minimumOrderQuantity: quotation.minimumOrderQuantity,
      suppliedQuantity: quotation.suppliedQuantity,
      leadTime: quotation.leadTime,
      leadTimeUnit: quotation.leadTimeUnit,
    });
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

  if (action === 'accept_counter' || (action === 'reject' && quotation.status === 'countered' && quotation.userId.toString() === session.userId)) {
    if (quotation.userId.toString() !== session.userId) throw Object.assign(new Error('Only the seller can respond to this counter offer'), { statusCode: 403 });
    const rfq = await quotationRepository.findRfqById(quotation.rfqId);
    const previousStatus = quotation.status;
    const current = quotationCurrentOffer(quotation);
    if (current.action !== 'buyer_counter' || current.actorRole !== 'buyer') throw Object.assign(new Error('There is no buyer counter offer awaiting your response'), { statusCode: 409 });
    const actionKey = freshness.idempotencyKey || `${Number(quotation.negotiationVersion || 0) + 1}`;

    if (action === 'accept_counter') {
      const nextStatus = assertTransition({ type: 'quotation', status: previousStatus, action, actorRole: 'seller' });
      quotation.unitPrice = current.unitPrice;
      quotation.totalPrice = current.totalPrice;
      quotation.shippingCost = current.shippingCost ?? quotation.shippingCost;
      quotation.taxes = { ...(quotation.taxes?.toObject?.() || quotation.taxes || {}), amount: current.taxAmount ?? quotation.taxes?.amount ?? 0 };
      quotation.minimumOrderQuantity = current.minimumOrderQuantity || quotation.minimumOrderQuantity;
      quotation.suppliedQuantity = current.suppliedQuantity || quotation.suppliedQuantity;
      quotation.leadTime = current.leadTime || quotation.leadTime;
      quotation.leadTimeUnit = current.leadTimeUnit || quotation.leadTimeUnit;
      quotation.paymentTerms = current.paymentTerms || quotation.paymentTerms;
      quotation.incoterms = current.incoterms || quotation.incoterms;
      quotation.status = nextStatus;
      quotation.previousStatus = previousStatus;
      quotation.acceptedAt = new Date();
      quotation.finalQuotation = { finalQuotationNumber: `FQ-${Date.now()}-${String(quotation._id).slice(-6).toUpperCase()}`, status: 'seller_preparation', version: 1 };
      quotation.negotiationVersion = Number(quotation.negotiationVersion || 0) + 1;
      quotation.currentOffer = { ...current, action: 'seller_accepted_counter', actorId: session.userId, actorRole: 'seller', notes: reason || 'Seller accepted the buyer counter offer.', createdAt: new Date(), sequence: quotation.negotiationVersion };
      quotation.negotiationHistory.push({ ...quotation.currentOffer.toObject?.() || quotation.currentOffer, idempotencyKey: freshness.idempotencyKey || undefined, message: reason || 'Seller accepted the buyer counter offer.' });
      quotation.activityTimeline.push({ action: 'seller_accepted_counter', status: nextStatus, message: reason || 'Seller accepted the buyer counter offer', actorId: session.userId, actorRole: 'seller' });
      await quotation.save();
      rfq.acceptedQuotationId = quotation._id;
      rfq.status = 'quoted';
      rfq.activityTimeline.push({ action: 'quotation_accepted', status: 'quoted', message: 'Seller accepted the buyer counter offer as the selected quotation', actorId: session.userId, actorRole: 'seller', metadata: { quotationId: quotation._id } });
      await rfq.save();
      await quotationRepository.createNotification({ eventKey: `quotation-counter-accepted:${quotation._id}:${actionKey}`, userId: rfq.buyerId, notificationType: 'quotation_accepted', title: 'Seller accepted your counter offer', description: `The agreed price is ${quotation.currency} ${quotation.unitPrice} per unit.`, data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}` }, priority: 'high' });
      await publishQuotationContext({ quotation, rfq, actorId: session.userId, receiverId: rfq.buyerId, deliveryKey: `quotation-counter-accepted:${quotation._id}:${actionKey}`, content: `Counter offer accepted\nProduct: ${rfq.title}\nAgreed price: ${quotation.currency} ${quotation.unitPrice} per unit\nView quotation: /quotations/${quotation._id}` });
      return { quotation, message: 'Counter offer accepted' };
    }

    quotation.status = assertTransition({ type: 'quotation', status: previousStatus, action: 'reject', actorRole: 'seller' });
    quotation.previousStatus = previousStatus;
    quotation.rejectedAt = new Date();
    quotation.rejectionReason = reason || 'Seller rejected the counter offer.';
    quotation.negotiationVersion = Number(quotation.negotiationVersion || 0) + 1;
    quotation.negotiationHistory.push({ action: 'rejected', idempotencyKey: freshness.idempotencyKey || undefined, actorId: session.userId, actorRole: 'seller', message: quotation.rejectionReason, unitPrice: current.unitPrice, previousUnitPrice: current.previousUnitPrice, createdAt: new Date() });
    await quotation.save();
    await quotationRepository.createNotification({ eventKey: `quotation-counter-rejected:${quotation._id}:${actionKey}`, userId: rfq.buyerId, notificationType: 'quotation_rejected', title: 'Seller rejected your counter offer', description: quotation.rejectionReason, data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}` }, priority: 'high' });
    await publishQuotationContext({ quotation, rfq, actorId: session.userId, receiverId: rfq.buyerId, deliveryKey: `quotation-counter-rejected:${quotation._id}:${actionKey}`, content: `Counter offer rejected\nProduct: ${rfq.title}\nReason: ${quotation.rejectionReason}\nView quotation: /quotations/${quotation._id}` });
    return { quotation, message: 'Counter offer rejected' };
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
    const previousOffer = quotationCurrentOffer(quotation);
    if (action === 'counter_offer' && (!Number.isFinite(Number(body.unitPrice)) || Number(body.unitPrice) <= 0)) {
      throw Object.assign(new Error('Enter a valid positive counter price'), { statusCode: 422 });
    }
    quotation.status = assertTransition({ type: 'quotation', status: previousStatus, action, actorRole: 'buyer' });
    if (previousStatus === 'final_quotation_pending') {
      const currentFinal = quotation.tradeDocuments.id(quotation.finalQuotation?.documentId);
      if (currentFinal) currentFinal.status = 'void';
      quotation.finalQuotation.status = 'changes_requested';
      quotation.activityTimeline.push({ action: 'final_quotation_changes_requested', status: 'buyer_accepted', message: reason || body.buyerMessage || 'Buyer requested changes to the Final Quotation', actorId: session.userId, actorRole: 'buyer', metadata: { documentId: currentFinal?._id, version: currentFinal?.version } });
    }

    const counterFields = {
      unitPrice: body.unitPrice,
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

    const offer = action === 'counter_offer' ? nextOffer(quotation, body, {
      action: 'buyer_counter', actorId: session.userId, actorRole: 'buyer',
      notes: reason || body.buyerMessage || 'Buyer sent a counter offer.', previousUnitPrice: previousOffer.unitPrice,
    }) : null;
    quotation.negotiationHistory.push({
      action: action === 'counter_offer' ? 'buyer_counter' : 'message',
      idempotencyKey: freshness.idempotencyKey || undefined,
      actorId: session.userId,
      actorRole: 'buyer',
      message: reason || body.buyerMessage || 'Buyer requested changes.',
      previousUnitPrice: previousOffer.unitPrice,
      ...(offer ? {
        unitPrice: offer.unitPrice,
        productSubtotal: offer.productSubtotal,
        shippingCost: offer.shippingCost,
        taxAmount: offer.taxAmount,
        totalPrice: offer.totalPrice,
        minimumOrderQuantity: offer.minimumOrderQuantity,
        suppliedQuantity: offer.suppliedQuantity,
        leadTime: offer.leadTime,
        leadTimeUnit: offer.leadTimeUnit,
      } : {}),
      ...Object.fromEntries(
        Object.entries(counterFields).filter(
          ([, value]) => value !== undefined && value !== ''
        )
      ),
    });

    quotation.buyerMessage =
      body.buyerMessage || reason || quotation.buyerMessage;
    if (offer) quotation.currentOffer = offer;
    quotation.negotiationVersion = Number(quotation.negotiationVersion || 0) + 1;

    quotation.previousStatus = previousStatus;
    quotation.approvalHistory.push({ action, previousStatus, newStatus: quotation.status, actorId: session.userId, actorRole: 'buyer', notes: reason || body.buyerMessage, documents: body.attachments || [] });
    quotation.activityTimeline.push({ action, status: quotation.status, message: reason || body.buyerMessage || 'Buyer requested quotation changes', actorId: session.userId, actorRole: 'buyer', metadata: { requestedChanges: counterFields, documents: body.attachments || [] } });

    await quotation.save();

    rfq.status = 'negotiating';
    await rfq.save();

    const actionKey = freshness.idempotencyKey || `${quotation.negotiationVersion}`;
    await quotationRepository.createNotification({
      eventKey: `quotation-${action}:${quotation._id}:${actionKey}`,
      userId: quotation.userId,
      notificationType:
        action === 'counter_offer'
          ? 'quotation_counter_offer'
          : 'quotation_revision_requested',
      title:
        action === 'counter_offer'
          ? 'Counter offer received'
          : 'Quotation revision requested',
      description: action === 'counter_offer'
        ? `Buyer countered at ${quotation.currency} ${offer.unitPrice} per unit (previous ${quotation.currency} ${previousOffer.unitPrice}).`
        : reason || 'The buyer requested changes to your quotation.',
      data: {
        relatedId: quotation._id,
        relatedModel: 'Quotation',
        actionUrl: `/quotations/${quotation._id}?role=seller`,
      },
      priority: 'high',
    });

    await publishQuotationContext({
      quotation, rfq, actorId: session.userId, receiverId: quotation.userId,
      deliveryKey: `quotation-${action}:${quotation._id}:${actionKey}`,
      content: action === 'counter_offer'
        ? `Counter offer submitted\nProduct: ${rfq.title}\nPrevious price: ${quotation.currency} ${previousOffer.unitPrice} per unit\nCounter price: ${quotation.currency} ${offer.unitPrice} per unit\nQuantity: ${offer.suppliedQuantity || rfq.quantity}\nNotes: ${offer.notes || '—'}\nView quotation: /quotations/${quotation._id}`
        : `Quotation revision requested\nProduct: ${rfq.title}\nNotes: ${reason || body.buyerMessage || 'Buyer requested changes.'}\nView quotation: /quotations/${quotation._id}`,
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
    !['draft', 'pending', 'submitted', 'negotiating', 'countered', 'revision_requested', 'revised'].includes(
      quotation.status
    )
  ) {
    const error = new Error('This quotation is no longer available for revision.');
    error.statusCode = 400;
    throw error;
  }

  const allowedFields = [
    'unitPrice', 'leadTime', 'leadTimeUnit', 'productionTime', 'productionTimeUnit',
    'paymentTerms', 'advanceRequired', 'minimumOrderQuantity',
    'suppliedQuantity', 'incoterms', 'shippingCost', 'shippingEstimate', 'shippingTerms',
    'pricingTiers', 'description', 'specifications',
    'customizationAvailable', 'customizationDetails', 'notes',
    'sellerMessage', 'attachments', 'packaging', 'samplePrice', 'taxes', 'specialClauses', 'productConfiguration',
  ];

  const previousOffer = quotationCurrentOffer(quotation);
  const previousConfiguration = resolveProductConfiguration(quotation);
  const nextProductConfig = {
    ...(previousConfiguration || {}),
    ...(body.productConfiguration && typeof body.productConfiguration === 'object' ? body.productConfiguration : {}),
    productId: quotation.productId || null,
    name: (body.productConfiguration && typeof body.productConfiguration === 'object' && body.productConfiguration.name) || previousConfiguration.name || quotation.title || 'Configured product',
    image: (body.productConfiguration && typeof body.productConfiguration === 'object' && body.productConfiguration.image) || previousConfiguration.image || '',
    description: (body.productConfiguration && typeof body.productConfiguration === 'object' && body.productConfiguration.description) || body.description || previousConfiguration.description || quotation.description || '',
    specifications: (body.productConfiguration && typeof body.productConfiguration === 'object' && body.productConfiguration.specifications) || body.specifications || previousConfiguration.specifications || quotation.specifications || '',
    quantity: Number(((body.productConfiguration && typeof body.productConfiguration === 'object' ? body.productConfiguration.quantity : quotation.suppliedQuantity) ?? quotation.suppliedQuantity ?? previousConfiguration.quantity ?? 1)) || 1,
    minimumOrderQuantity: Number(((body.productConfiguration && typeof body.productConfiguration === 'object' ? body.productConfiguration.minimumOrderQuantity : quotation.minimumOrderQuantity) ?? quotation.minimumOrderQuantity ?? previousConfiguration.minimumOrderQuantity ?? 1)) || 1,
    unitPrice: Number(((body.productConfiguration && typeof body.productConfiguration === 'object' ? body.productConfiguration.unitPrice : quotation.unitPrice) ?? quotation.unitPrice ?? previousConfiguration.unitPrice ?? 0)) || 0,
    currency: normalizeCurrency((body.productConfiguration && typeof body.productConfiguration === 'object' && body.productConfiguration.currency) || quotation.currency || previousConfiguration.currency || 'INR'),
    leadTime: Number(((body.productConfiguration && typeof body.productConfiguration === 'object' ? body.productConfiguration.leadTime : quotation.leadTime) ?? quotation.leadTime ?? previousConfiguration.leadTime ?? 0)) || 0,
    leadTimeUnit: (body.productConfiguration && typeof body.productConfiguration === 'object' && body.productConfiguration.leadTimeUnit) || quotation.leadTimeUnit || previousConfiguration.leadTimeUnit || 'days',
    paymentTerms: (body.productConfiguration && typeof body.productConfiguration === 'object' && body.productConfiguration.paymentTerms) || quotation.paymentTerms || previousConfiguration.paymentTerms || 'negotiable',
    shippingTerms: (body.productConfiguration && typeof body.productConfiguration === 'object' && body.productConfiguration.shippingTerms) || quotation.shippingTerms || previousConfiguration.shippingTerms || '',
    packaging: (body.productConfiguration && typeof body.productConfiguration === 'object' && body.productConfiguration.packaging) || quotation.packaging || previousConfiguration.packaging || '',
    customNotes: (body.productConfiguration && typeof body.productConfiguration === 'object' && body.productConfiguration.customNotes) || body.sellerMessage || quotation.sellerMessage || previousConfiguration.customNotes || '',
  };

  quotation.productConfiguration = nextProductConfig;
  const changedProductFields = Object.keys(nextProductConfig).filter((key) => JSON.stringify(nextProductConfig[key]) !== JSON.stringify(previousConfiguration[key]));
  if (changedProductFields.length) quotation.productConfigurationHistory.push({
    version: (quotation.productConfigurationHistory?.length || 0) + 1,
    changedFields: changedProductFields,
    changedBy: session.userId,
    actorRole: 'seller',
    reason: body.productChangeReason || body.sellerMessage || body.reason || 'Deal product updated',
    createdAt: new Date(),
    previousSnapshot: previousConfiguration,
    snapshot: nextProductConfig,
  });

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

  if ([quotation.unitPrice, quotation.minimumOrderQuantity, quotation.suppliedQuantity, quotation.leadTime].some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
    throw Object.assign(new Error('Unit price, MOQ, available quantity, and lead time must be valid positive numbers'), { statusCode: 422 });
  }

  quotation.revisionNumber += 1;
  const previousStatus = quotation.status;
  quotation.status = previousStatus === 'draft' ? 'draft' : 'revised';
  const revisionTotals = resolveOfferTotals(quotation, quotation);
  quotation.totalPrice = revisionTotals.finalTotal;
  quotation.taxes = { ...(quotation.taxes?.toObject?.() || quotation.taxes || {}), amount: revisionTotals.taxAmount };
  quotation.negotiationHistory.push({
    action: 'seller_revision',
    idempotencyKey: freshness.idempotencyKey || undefined,
    actorId: session.userId,
    actorRole: 'seller',
    message: body.sellerMessage || body.productChangeReason || body.notes || (changedProductFields.length ? 'Seller updated the deal product configuration.' : 'Seller revised the quotation.'),
    previousUnitPrice: previousOffer.unitPrice,
    unitPrice: quotation.unitPrice,
    productSubtotal: revisionTotals.productSubtotal,
    shippingCost: revisionTotals.shippingCost,
    taxAmount: revisionTotals.taxAmount,
    totalPrice: revisionTotals.finalTotal,
    minimumOrderQuantity: quotation.minimumOrderQuantity,
    suppliedQuantity: quotation.suppliedQuantity,
    leadTime: quotation.leadTime,
    leadTimeUnit: quotation.leadTimeUnit,
  });

  quotation.negotiationVersion = Number(quotation.negotiationVersion || 0) + 1;
  quotation.currentOffer = nextOffer(quotation, quotation, {
    action: 'seller_revision', actorId: session.userId, actorRole: 'seller',
    notes: body.sellerMessage || body.notes || 'Seller revised the quotation.', previousUnitPrice: previousOffer.unitPrice,
  });

  quotation.previousStatus = previousStatus;
  quotation.activityTimeline.push({ action: previousStatus === 'draft' ? 'draft_updated' : changedProductFields.length ? 'deal_product_updated' : 'seller_revision', status: quotation.status, message: body.sellerMessage || body.productChangeReason || body.notes || `Quotation version ${quotation.revisionNumber} updated`, actorId: session.userId, actorRole: 'seller', metadata: { version: quotation.revisionNumber, changedProductFields, documents: quotation.attachments || [] } });

  await quotation.save();

  const rfq = await quotationRepository.findRfqById(quotation.rfqId);
  if (rfq && quotation.status !== 'draft') {
    rfq.status = 'negotiating';
    rfq.activityTimeline.push({ action: 'quotation_revised', status: 'negotiating', message: `Quotation version ${quotation.revisionNumber} is ready for buyer review`, actorId: session.userId, actorRole: 'seller', metadata: { quotationId: quotation._id } });
    await rfq.save();
    const actionKey = freshness.idempotencyKey || `${quotation.negotiationVersion}`;
    await quotationRepository.createNotification({ eventKey: `quotation-revised:${quotation._id}:${actionKey}`, userId: rfq.buyerId, notificationType: 'quotation_revised', title: 'Quotation revised', description: `Seller revised the quotation to ${quotation.currency} ${quotation.unitPrice} per unit.`, data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}` }, priority: 'high' });
    await publishQuotationContext({ quotation, rfq, actorId: session.userId, receiverId: rfq.buyerId, deliveryKey: `quotation-revised:${quotation._id}:${actionKey}`, content: `Quotation revised\nProduct: ${rfq.title}\nPrevious price: ${quotation.currency} ${previousOffer.unitPrice} per unit\nRevised price: ${quotation.currency} ${quotation.unitPrice} per unit\nQuantity: ${quotation.suppliedQuantity || rfq.quantity}\nNotes: ${body.sellerMessage || body.notes || '—'}\nView quotation: /quotations/${quotation._id}` });
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
  const freshness = await assertFreshNegotiation(quotation, body);
  if (freshness.existing) return { quotation, reused: true, tradeOrder: null, message: 'This negotiation action was already processed' };

  if (!['accept', 'reject'].includes(action)) {
    const error = new Error('Invalid action');
    error.statusCode = 400;
    throw error;
  }

  const previousStatus = quotation.status;
  if (action === 'accept' && previousStatus === 'buyer_accepted') {
    const updatedQuotation = await quotationRepository.findQuotationByIdLean(quotationId);
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
    quotation.negotiationVersion = Number(quotation.negotiationVersion || 0) + 1;
    const acceptedOffer = quotationCurrentOffer(quotation);
    quotation.currentOffer = { ...acceptedOffer, action: 'accepted', actorId: session.userId, actorRole: 'buyer', notes: reason || 'Buyer accepted the negotiated quotation.', createdAt: new Date(), sequence: quotation.negotiationVersion };
    quotation.negotiationHistory.push({
      action: 'accepted',
      idempotencyKey: freshness.idempotencyKey || undefined,
      actorId: session.userId,
      actorRole: 'buyer',
      message: 'Buyer accepted the negotiated quotation. Seller must now prepare the Final Quotation.',
      unitPrice: acceptedOffer.unitPrice,
      totalPrice: acceptedOffer.totalPrice,
    });
    quotation.approvalHistory.push({ action: 'buyer_accepted', previousStatus, newStatus: quotation.status, actorId: session.userId, actorRole: 'buyer', notes: reason || 'Buyer accepted final quotation' });
    quotation.activityTimeline.push({ action: 'buyer_accepted', status: quotation.status, message: 'Waiting for Seller to prepare the Final Quotation', actorId: session.userId, actorRole: 'buyer' });
  } else {
    quotation.status = 'rejected';
    quotation.rejectedAt = new Date();
    quotation.rejectionReason = reason || null;
    quotation.negotiationVersion = Number(quotation.negotiationVersion || 0) + 1;
    quotation.negotiationHistory.push({
      action: 'rejected',
      idempotencyKey: freshness.idempotencyKey || undefined,
      actorId: session.userId,
      actorRole: 'buyer',
      message: reason || 'Buyer rejected the quotation.',
    });
  }

  await quotation.save();

  if (action === 'accept') {
    quotation.rfqId.acceptedQuotationId = quotation._id;
    quotation.rfqId.status = 'quoted';
    quotation.rfqId.activityTimeline.push({ action: 'quotation_accepted', status: 'quoted', message: 'Buyer selected this quotation for Final Quotation preparation', actorId: session.userId, actorRole: 'buyer', metadata: { quotationId: quotation._id } });
    await quotation.rfqId.save();
    const updatedQuotation = await quotationRepository.findQuotationByIdLean(quotationId);
    const actionKey = freshness.idempotencyKey || `${quotation.negotiationVersion}`;
    const sellerNotification = await quotationRepository.createNotification({ eventKey: `quotation-accepted:${quotation._id}:${actionKey}`, userId: quotation.userId, notificationType: 'quotation_accepted', title: 'Buyer accepted — prepare the Final Quotation', description: `Buyer accepted ${quotation.currency} ${quotationCurrentOffer(updatedQuotation).unitPrice} per unit. Complete the Final Quotation.`, data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}?role=seller#final-quotation-title` }, priority: 'high' });
    await publishQuotationContext({ quotation: updatedQuotation, rfq: quotation.rfqId, actorId: session.userId, receiverId: quotation.userId, deliveryKey: `quotation-accepted:${quotation._id}:${actionKey}`, content: `Quotation accepted\nFinal agreed price: ${quotation.currency} ${quotationCurrentOffer(updatedQuotation).unitPrice} per unit\nView quotation: /quotations/${quotation._id}` });
    const io = getIO();
    if (io) {
      const event = { quotationId: quotation._id, rfqId: quotation.rfqId?._id || quotation.rfqId, status: quotation.status, action };
      io.to(`user_${quotation.userId?._id || quotation.userId}`).emit('new_notification', sellerNotification);
      io.to(`user_${quotation.userId?._id || quotation.userId}`).emit('quotation_updated', event);
      io.to(`user_${session.userId}`).emit('quotation_updated', event);
    }
    return { quotation: updatedQuotation, tradeOrder: null, message: 'Quotation accepted. The Seller will now prepare the Final Quotation.' };
  }

  const actionKey = freshness.idempotencyKey || `${quotation.negotiationVersion}`;
  await quotationRepository.createNotification({
    eventKey: `quotation-rejected:${quotation._id}:${actionKey}`,
    userId: quotation.userId,
    notificationType: 'quotation_rejected',
    title: 'Quotation rejected',
    description: reason || 'The buyer rejected your quotation.',
    data: { relatedId: quotation._id, relatedModel: 'Quotation', actionUrl: `/quotations/${quotation._id}?role=seller` },
  });
  await publishQuotationContext({ quotation, rfq: quotation.rfqId, actorId: session.userId, receiverId: quotation.userId, deliveryKey: `quotation-rejected:${quotation._id}:${actionKey}`, content: `Quotation rejected\nReason: ${reason || 'Buyer rejected the quotation.'}\nView quotation: /quotations/${quotation._id}` });

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
  const productConfig = resolveProductConfiguration(quotation, product);
  const buyerCompany = buyer?.metadata?.companyName || buyer?.companyName;
  const buyerAddress = buyer?.metadata?.address || buyer?.address;
  const sellerAddress = sellerProfile?.address;
  const productImage = product?.images?.[0]?.url || product?.images?.[0] || finalRfq?.images?.[0]?.url || finalRfq?.images?.[0];
  const quantity = Number(quotation.suppliedQuantity || finalRfq?.quantity || 0);
  const productTotal = Number(quotation.unitPrice || 0) * quantity;
  const shippingCost = Number(quotation.shippingCost || 0);
  const taxAmount = Number(quotation.taxes?.amount || 0);
  const finalPayableAmount = productTotal + shippingCost + taxAmount;
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
      products: [{ productId: quotation.productId?._id || quotation.productId || finalRfq?.productId, name: productConfig.name || product?.name || quotation.productId?.name || finalRfq?.title, image: productConfig.image || productImage, description: productConfig.description || product?.description || quotation.description || finalRfq?.description, category: product?.category || finalRfq?.category, subcategory: product?.subcategory || finalRfq?.subcategory, brand: product?.brand, sku: product?.sku, countryOfOrigin: product?.countryOfOrigin, specifications: productConfig.specifications || quotation.specifications || finalRfq?.specifications, quantity: Number(productConfig.quantity ?? quantity), unit: finalRfq?.unit, minimumOrderQuantity: Number(productConfig.minimumOrderQuantity ?? quotation.minimumOrderQuantity), unitPrice: Number(productConfig.unitPrice ?? quotation.unitPrice), totalPrice: Number(productConfig.unitPrice ?? quotation.unitPrice) * Number(productConfig.quantity ?? quantity) }],
      pricing: { unitPrice: quotation.unitPrice, productTotal, shippingCost, taxAmount, finalPayableAmount, totalPrice: finalPayableAmount, currency: quotation.currency },
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
    metadata: { isFinalQuotation: true, finalQuotationNumber: quotation.finalQuotation.finalQuotationNumber, directOrderEnabled: false },
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
  let quotation = await quotationRepository.findQuotationByIdLean(quotationId);
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

async function publishQuotationContext({ quotation, rfq, actorId, receiverId, content, deliveryKey }) {
  if (!rfq || !receiverId || !content) return;
  const { chat } = await findOrCreateConversation({ buyerId: rfq.buyerId, sellerId: quotation.userId?._id || quotation.userId, productId: quotation.productId || rfq.productId, rfqId: rfq._id, quotationId: quotation._id, chatType: 'rfq_negotiation' });
  const message = await quotationRepository.createMessageOnce({ deliveryKey, chatId: chat._id, senderId: actorId, receiverId, content, messageType: 'quotation', quotationDetails: { quotationId: quotation._id, rfqId: rfq._id, unitPrice: quotationCurrentOffer(quotation).unitPrice || quotation.unitPrice, currency: quotation.currency, minimumOrderQuantity: quotationCurrentOffer(quotation).minimumOrderQuantity || quotation.minimumOrderQuantity, leadTime: quotationCurrentOffer(quotation).leadTime || quotation.leadTime, status: quotation.status, actionUrl: `/quotations/${quotation._id}` } });
  chat.lastMessage = content; chat.lastMessageAt = new Date();
  if (String(receiverId) === String(rfq.buyerId)) chat.buyerUnreadCount += 1; else chat.sellerUnreadCount += 1;
  await chat.save();
  const io = getIO(); if (io) { const event = { quotationId: quotation._id, rfqId: rfq._id, status: quotation.status }; io.to(`chat_${chat._id}`).emit('new_message', message); io.to(`chat_${chat._id}`).emit('quotation_updated', event); io.to(`user_${receiverId}`).emit('quotation_updated', event); io.to(`user_${actorId}`).emit('quotation_updated', event); }
}
