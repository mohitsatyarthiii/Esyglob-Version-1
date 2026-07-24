import mongoose from 'mongoose';
import * as rfqRepository from '../repositories/rfq.repository.js';
import { findOrCreateConversation } from '../lib/chat-conversations.js';
import Chat from '../models/Chat.js';
import RFQ from '../models/RFQ.js';
import { getIO } from '../lib/socket.js';
import {
  BUYER_STATUS_GROUPS,
  OPEN_RFQ_STATUSES,
  VALID_UNITS,
  clean,
  idOf,
  idMatches,
  idListIncludes,
  escapeRegex,
  toPositiveInt,
  getSort,
  normalizeFiles,
  buildRfqSummary,
} from '../lib/rfq-helpers.js';
import { validateNoContactInfo } from '../lib/contact-moderation.js';
import { USER_ROLES } from '../lib/constants.js';
import { assertTransition, lifecycleSnapshot, recordTransition } from './business-lifecycle.service.js';

// ─── Seller Access Check ───────────────────────────────────
async function isPrivateRfqRecipient(rfq, sessionUserId, seller) {
  if (!seller || seller.isActive === false || seller.isSuspended === true) return false;

  if (idMatches(rfq.sellerUserId, sessionUserId)) return true;
  if (idMatches(rfq.sellerId, seller._id)) return true;
  if (idListIncludes(rfq.specificSupplierIds, seller._id)) return true;

  return rfqRepository.chatExistsForRfq(rfq._id, idOf(rfq.buyerId), sessionUserId);
}

async function canSellerAccessRfq(rfq, sessionUserId, seller) {
  if (!seller || !seller.isActive || seller.isSuspended) return false;

  if (rfq.visibility === 'private') {
    return isPrivateRfqRecipient(rfq, sessionUserId, seller);
  }

  if (rfq.isVerifiedSuppliersOnly && !seller.isVerified) return false;

  if (
    rfq.preferredSuppliersCountries?.length &&
    !rfq.preferredSuppliersCountries.includes(seller.address?.country)
  ) {
    return false;
  }

  return OPEN_RFQ_STATUSES.includes(rfq.status) && sellerMatchesPublicRfq(seller, rfq);
}

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function sellerMatchesPublicRfq(seller, rfq) {
  const category = normalized(rfq.category);
  const subcategory = normalized(rfq.subcategory);
  const categories = (seller.productCategories || []).map(normalized).filter(Boolean);
  const subcategories = (seller.productSubcategories || []).map(normalized).filter(Boolean);
  const industries = (seller.industries || []).map(normalized).filter(Boolean);
  const rfqText = normalized([rfq.title, rfq.description, rfq.category, rfq.subcategory].filter(Boolean).join(' '));

  return (
    categories.includes(category) ||
    categories.includes(subcategory) ||
    subcategories.includes(subcategory) ||
    industries.some((industry) => industry.length > 2 && rfqText.includes(industry))
  );
}

function publicRfqMatchQuery(seller) {
  const exactTerms = [...new Set([
    ...(seller?.productCategories || []),
    ...(seller?.productSubcategories || []),
  ].map((value) => String(value).trim()).filter(Boolean))];
  const industryTerms = [...new Set(
    (seller?.industries || []).map((value) => String(value).trim()).filter((value) => value.length > 2)
  )];
  const matchers = [];

  exactTerms.forEach((term) => {
    const exact = new RegExp(`^${escapeRegex(term)}$`, 'i');
    matchers.push({ category: exact }, { subcategory: exact });
  });
  industryTerms.forEach((term) => {
    const contains = new RegExp(escapeRegex(term), 'i');
    matchers.push({ title: contains }, { description: contains }, { category: contains }, { subcategory: contains });
  });

  return matchers.length
    ? { $and: [{ visibility: 'public' }, { $or: matchers }] }
    : null;
}

// ─── Get RFQ List ──────────────────────────────────────────
export async function getRfqs(session, searchParams) {
  const {
    status,
    category,
    country,
    search,
    deliveryTimeline,
    incoterms,
    verifiedOnly,
    sort: sortParam,
    order,
    page = 1,
    limit = 10,
    scope,
    visibility,
  } = searchParams;

  const query = {};
  const pageNum = toPositiveInt(page, 1);
  const limitNum = toPositiveInt(limit, 10, 50);

  const wantsBuyerScope =
    scope === 'buyer' ||
    (session?.roles?.includes(USER_ROLES.BUYER) &&
      !session.roles?.includes(USER_ROLES.SELLER) &&
      !visibility);

  if (wantsBuyerScope) {
    if (!session?.userId) {
      const error = new Error('Please sign in to continue');
      error.statusCode = 401;
      throw error;
    }
    if (!session.roles?.includes(USER_ROLES.BUYER)) {
      const error = new Error('Buyer access required');
      error.statusCode = 403;
      throw error;
    }
    query.buyerId = session.userId;
    if (status && status !== 'all') {
      query.status = BUYER_STATUS_GROUPS[status]
        ? { $in: BUYER_STATUS_GROUPS[status] }
        : status;
    } else {
      query.status = { $ne: 'archived' };
    }
  } else if (scope === 'seller') {
    if (!session?.userId) {
      const error = new Error('Please sign in to continue');
      error.statusCode = 401;
      throw error;
    }
    if (!session.roles?.includes(USER_ROLES.SELLER)) {
      const error = new Error('Seller access required');
      error.statusCode = 403;
      throw error;
    }
    const seller = await rfqRepository.findSellerByUserId(session.userId);
    query.status =
      status && status !== 'all'
        ? status
        : { $in: ['active', 'pending', 'viewed', 'replied', 'quoted', 'negotiating'] };
    const eligiblePublic = publicRfqMatchQuery(seller);
    query.$and = [{
      $or: [
        { sellerUserId: session.userId },
        ...(seller?._id ? [{ specificSupplierIds: seller._id }, { sellerId: seller._id }] : []),
        ...(eligiblePublic ? [eligiblePublic] : []),
      ],
    }];
    if (seller && !seller.isVerified) {
      query.isVerifiedSuppliersOnly = { $ne: true };
    }
  } else {
    query.status =
      status && status !== 'all'
        ? status
        : { $in: ['active', 'viewed', 'replied', 'quoted', 'negotiating'] };
    query.visibility = 'public';
  }

  if (category) query.category = category;
  if (country) query.deliveryCountry = country;
  if (deliveryTimeline) query.deliveryTimeline = deliveryTimeline;
  if (incoterms) query.incoterms = incoterms;
  if (verifiedOnly) query.isVerifiedSuppliersOnly = true;

  if (search) {
    const safeSearch = escapeRegex(search.slice(0, 100));
    query.$or = [
      { title: { $regex: safeSearch, $options: 'i' } },
      { description: { $regex: safeSearch, $options: 'i' } },
      { category: { $regex: safeSearch, $options: 'i' } },
      { subcategory: { $regex: safeSearch, $options: 'i' } },
    ];
  }

  const sortObj = getSort(sortParam, order);

  const [rfqs, total] = await Promise.all([
    rfqRepository.findRfqs(query, sortObj, (pageNum - 1) * limitNum, limitNum),
    rfqRepository.countRfqs(query),
  ]);

  const pages = Math.ceil(total / limitNum);

  return {
    rfqs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages,
      totalPages: pages,
      hasMore: pageNum < pages,
    },
  };
}

// ─── Create RFQ ────────────────────────────────────────────
export async function createRfq(session, body) {
  const {
    title,
    productId,
    rfqType,
    description,
    category,
    subcategory,
    specifications,
    items,
    quantity,
    minimumOrderQuantity,
    unit,
    targetPrice,
    currency,
    deliveryCountry,
    deliveryPort,
    deliveryTimeline,
    deliveryDate,
    shippingPreference,
    incoterms,
    attachments,
    images,
    documents,
    drawings,
    preferredSuppliersCountries,
    isVerifiedSuppliersOnly,
    visibility,
    sellerId: requestedSellerId,
    sellerUserId: requestedSellerUserId,
    status: requestStatus,
  } = body;

  let targetSeller = null;
  if (requestedSellerId) {
    targetSeller = await rfqRepository.findSellerById(requestedSellerId);
  } else if (requestedSellerUserId) {
    targetSeller = await rfqRepository.findSellerByUserId(requestedSellerUserId);
  }
  if ((requestedSellerId || requestedSellerUserId) && !targetSeller) {
    const error = new Error('Selected supplier is not available');
    error.statusCode = 404;
    throw error;
  }
  if (targetSeller && idMatches(targetSeller.userId, session.userId)) {
    const error = new Error('You cannot send an RFQ to yourself');
    error.statusCode = 400;
    throw error;
  }

  const moderation = validateNoContactInfo({
    title,
    description,
    specifications,
    items: Array.isArray(items)
      ? items.map((item) => ({
          name: item.name,
          specifications: item.specifications,
        }))
      : [],
    deliveryCountry,
    deliveryPort,
  });

  if (!moderation.ok) {
    const error = new Error(moderation.error);
    error.statusCode = 422;
    error.contactInfoBlocked = true;
    throw error;
  }

  if (!title || !description || !category || !quantity || !deliveryCountry) {
    const error = new Error('Missing required fields');
    error.statusCode = 400;
    throw error;
  }

  if (productId && !mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error('Missing required fields');
    error.statusCode = 400;
    throw error;
  }

  const rfq = await rfqRepository.createRfq({
    buyerId: session.userId,
    sellerId: targetSeller?._id,
    sellerUserId: targetSeller?.userId,
    productId: productId || null,
    rfqType:
      rfqType ||
      (items?.length > 1 ? 'multi_product' : productId ? 'product' : 'custom'),
    title,
    description,
    category,
    subcategory: subcategory || '',
    specifications: specifications || '',
    items:
      Array.isArray(items) && items.length
        ? items
        : [
            {
              productId: productId || undefined,
              name: title,
              category,
              subcategory: subcategory || '',
              quantity,
              unit,
              targetPrice,
              specifications: specifications || description,
            },
          ],
    quantity,
    minimumOrderQuantity,
    unit,
    targetPrice,
    currency,
    deliveryCountry,
    deliveryPort,
    deliveryTimeline,
    deliveryDate,
    shippingPreference,
    incoterms,
    attachments: normalizeFiles(attachments, 'other'),
    images: normalizeFiles(images, 'image'),
    documents: normalizeFiles(documents, 'document'),
    drawings: normalizeFiles(drawings, 'document'),
    preferredSuppliersCountries: preferredSuppliersCountries || [],
    specificSupplierIds: targetSeller ? [targetSeller._id] : [],
    isVerifiedSuppliersOnly: isVerifiedSuppliersOnly || false,
    visibility: targetSeller ? 'private' : (visibility || 'public'),
    status: requestStatus === 'draft' ? 'draft' : 'submitted',
    expiresAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    activityTimeline: [{ action: requestStatus === 'draft' ? 'draft_saved' : 'rfq_submitted', status: requestStatus === 'draft' ? 'draft' : 'submitted', message: title, actorId: session.userId, actorRole: 'buyer' }],
  });

  if (targetSeller && rfq.status === 'submitted') {
    const { chat } = await findOrCreateConversation({
      buyerId: session.userId,
      sellerId: targetSeller.userId,
      productId: productId || undefined,
      rfqId: rfq._id,
      chatType: 'rfq_negotiation',
    });
    rfq.conversationId = chat._id;
    await rfq.save();

    const Message = (await import('../models/Message.js')).default;
    const Notification = (await import('../models/Notification.js')).default;
    const message = await Message.create({
      chatId: chat._id,
      senderId: session.userId,
      receiverId: targetSeller.userId,
      content: `Private RFQ: ${title}\nQuantity: ${quantity} ${unit || 'pcs'}\nDestination: ${deliveryCountry}\n\n${description}`,
      messageType: 'rfq',
      rfqDetails: {
        rfqId: rfq._id,
        title: rfq.title,
        product: rfq.title,
        quantity: rfq.quantity,
        unit: rfq.unit,
        targetPrice: rfq.targetPrice,
        status: rfq.status,
        date: rfq.createdAt,
        actionUrl: `/dashboard/seller/rfqs/${rfq._id}`,
      },
    });
    await Promise.all([
      Chat.updateOne({ _id: chat._id }, {
        $set: {
          rfqId: rfq._id,
          chatType: 'rfq_negotiation',
          lastMessage: `Private RFQ: ${title}`,
          lastMessageAt: new Date(),
        },
        $inc: { sellerUnreadCount: 1 },
      }),
      Notification.create({
        userId: targetSeller.userId,
        notificationType: 'rfq_created',
        title: 'New private RFQ received',
        description: title,
        data: {
          relatedId: rfq._id,
          relatedModel: 'RFQ',
          actionUrl: `/dashboard/seller/rfqs/${rfq._id}`,
        },
        priority: 'high',
      }),
    ]);
    const io = getIO();
    if (io) {
      io.to(`chat_${chat._id}`).emit('new_message', message);
      io.to(`user_${targetSeller.userId}`).emit('new_notification', {
        type: 'rfq_created',
        rfqId: String(rfq._id),
        chatId: String(chat._id),
      });
    }
    return { rfq, chat, message: 'Private RFQ sent successfully' };
  }

  // Notify matching sellers only for public marketplace RFQs.
  if (rfq.status === 'submitted' && rfq.visibility === 'public') {
    const sellerQuery = { isActive: true, isSuspended: { $ne: true } };
    if (isVerifiedSuppliersOnly) sellerQuery.isVerified = true;
    if (preferredSuppliersCountries?.length) {
      sellerQuery['address.country'] = { $in: preferredSuppliersCountries };
    }
    const matchTerms = [category, subcategory]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (matchTerms.length) {
      const exact = matchTerms.map((term) => new RegExp(`^${escapeRegex(term)}$`, 'i'));
      sellerQuery.$or = [
        { productCategories: { $in: exact } },
        { productSubcategories: { $in: exact } },
        { industries: { $in: exact } },
      ];
    } else {
      sellerQuery._id = null;
    }

    const sellers = await rfqRepository.findSellersForNotification(sellerQuery);

    if (sellers.length) {
      await rfqRepository.createNotifications(
        sellers.map((seller) => ({
          userId: seller.userId,
          notificationType: 'rfq_created',
          title: 'New RFQ matching your marketplace',
          description: title,
          data: {
            relatedId: rfq._id,
            relatedModel: 'RFQ',
            actionUrl: `/dashboard/seller/rfqs/${rfq._id}`,
          },
          priority: 'medium',
        }))
      );
    }
  }

  return { rfq, message: 'RFQ created successfully' };
}

// ─── Get RFQ Detail ────────────────────────────────────────
export async function getRfqDetail(session, rfqId) {
  const rfq = await rfqRepository.findRfqById(rfqId);

  if (!rfq) {
    const error = new Error('RFQ not found');
    error.statusCode = 404;
    throw error;
  }

  const isPublicRead =
    rfq.visibility === 'public' && OPEN_RFQ_STATUSES.includes(rfq.status);
  const isOwner = session?.userId && idMatches(rfq.buyerId, session.userId);
  const isAdmin = session?.roles?.includes(USER_ROLES.ADMIN);

  const seller =
    session?.roles?.includes(USER_ROLES.SELLER)
      ? await rfqRepository.findSellerByUserId(session.userId)
      : null;

  const isEligibleSeller = session?.userId
    ? await canSellerAccessRfq(rfq, session.userId, seller)
    : false;

  if (!isPublicRead && !isOwner && !isAdmin && !isEligibleSeller) {
    const error = new Error('Unauthorized');
    error.statusCode = 403;
    throw error;
  }

  // Quotations
  let quotationQuery = { rfqId };
  if (!isOwner && !isAdmin) {
    if (!session?.userId) {
      return { rfq, quotations: [], quotationCount: 0, chats: [] };
    }
    quotationQuery.userId = session.userId;
  }

  const [quotations, chats] = await Promise.all([
    rfqRepository.findQuotationsByRfq(
      rfqId,
      quotationQuery.userId || null
    ),
    session?.userId
      ? rfqRepository.findRfqChats(rfqId, session.userId)
      : Promise.resolve([]),
  ]);

  const actorRole = isOwner ? 'buyer' : isEligibleSeller ? 'seller' : isAdmin ? 'admin' : 'viewer';
  const rfqPayload = rfq.toObject ? rfq.toObject() : rfq;
  if (actorRole === 'seller') {
    const sellerEvents = (rfqPayload.activityTimeline || []).filter(event => idMatches(event.actorId, session.userId));
    rfqPayload.sellerWorkflow = { accepted: sellerEvents.some(event => event.action === 'seller_accept') || rfqPayload.status === 'seller_accepted', rejected: sellerEvents.some(event => event.action === 'seller_reject'), informationRequested: sellerEvents.some(event => event.action === 'seller_request_information') };
  }
  rfqPayload.lifecycle = lifecycleSnapshot('rfq', rfqPayload, actorRole);
  return {
    rfq: rfqPayload,
    quotations,
    quotationCount: quotations.length,
    chats,
  };
}

// ─── Update RFQ ────────────────────────────────────────────
export async function updateRfq(session, rfqId, body) {
  const rfq = await rfqRepository.findRfqByIdLean(rfqId);

  if (!rfq) {
    const error = new Error('RFQ not found');
    error.statusCode = 404;
    throw error;
  }

  const { action } = body;

  // Seller actions: mark_viewed, mark_replied
  if (action === 'mark_viewed') {
    const seller = session.roles?.includes(USER_ROLES.SELLER)
      ? await rfqRepository.findSellerByUserId(session.userId)
      : null;

    if (!(await canSellerAccessRfq(rfq, session.userId, seller))) {
      const error = new Error('Seller is not eligible for this RFQ');
      error.statusCode = 403;
      throw error;
    }

    if (!rfq.viewedBySellerIds.some((id) => id.toString() === session.userId)) {
      rfq.viewedBySellerIds.push(session.userId);
      rfq.status = ['pending', 'submitted', 'active'].includes(rfq.status) ? 'viewed' : rfq.status;
      await rfq.save();
    }

    return { rfq, message: 'RFQ marked as viewed' };
  }

  if (action === 'mark_replied') {
    const seller = session.roles?.includes(USER_ROLES.SELLER)
      ? await rfqRepository.findSellerByUserId(session.userId)
      : null;

    if (!(await canSellerAccessRfq(rfq, session.userId, seller))) {
      const error = new Error('Seller is not eligible for this RFQ');
      error.statusCode = 403;
      throw error;
    }

    if (!rfq.repliedBySellerIds.some((id) => id.toString() === session.userId)) {
      rfq.repliedBySellerIds.push(session.userId);
      rfq.status = ['pending', 'viewed', 'active'].includes(rfq.status)
        ? 'quoted'
        : rfq.status;
      await rfq.save();
    }

    return { rfq, message: 'RFQ marked as replied' };
  }

  if (['decline', 'accept', 'request_information'].includes(action)) {
    const seller = session.roles?.includes(USER_ROLES.SELLER) ? await rfqRepository.findSellerByUserId(session.userId) : null;
    if (!(await canSellerAccessRfq(rfq, session.userId, seller))) { const error = new Error('Seller is not eligible for this RFQ'); error.statusCode = 403; throw error; }
    const lifecycleAction = action === 'decline' ? 'reject' : action;
    let nextStatus = rfq.status;
    if (rfq.visibility === 'private') nextStatus = assertTransition({ type: 'rfq', status: rfq.status, action: lifecycleAction, actorRole: 'seller' });
    const previousStatus = rfq.status;
    recordTransition(rfq, { type: 'rfq', action: `seller_${lifecycleAction}`, fromStatus: previousStatus, toStatus: nextStatus, actorId: session.userId, actorRole: 'seller', notes: body.reason || body.notes || `Seller ${lifecycleAction}ed this RFQ`, documents: body.documents || [] });
    await rfq.save();
    await rfqRepository.createNotification({ userId: rfq.buyerId, notificationType: 'supplier_response', title: action === 'request_information' ? 'Seller requested more information' : `Seller ${action}ed RFQ`, description: body.reason || body.notes || 'Review the RFQ workflow update.', data: { relatedId: rfq._id, relatedModel: 'RFQ', actionUrl: `/rfqs/${rfq._id}` }, priority: 'high' });
    if (action === 'accept') {
      const { chat } = await findOrCreateConversation({ buyerId: rfq.buyerId, sellerId: session.userId, productId: rfq.productId, rfqId: rfq._id, chatType: 'rfq_negotiation' });
      const Message = (await import('../models/Message.js')).default;
      const content = `RFQ ${rfq.rfqNumber || rfq.title} accepted by the Seller. Quotation preparation is now enabled.`;
      const message = await Message.create({ chatId: chat._id, senderId: session.userId, receiverId: rfq.buyerId, content, messageType: 'system', rfqDetails: { rfqId: rfq._id, title: rfq.title, quantity: rfq.quantity, unit: rfq.unit, status: 'accepted', actionUrl: `/rfqs/${rfq._id}` }, isRead: false });
      chat.lastMessage = content;
      chat.lastMessageAt = new Date();
      chat.buyerUnreadCount = Number(chat.buyerUnreadCount || 0) + 1;
      await chat.save();
      const io = getIO();
      if (io) {
        io.to(`chat_${chat._id}`).emit('new_message', message);
        io.to(`user_${rfq.buyerId}`).emit('rfq_updated', { rfqId: rfq._id, action: 'accept' });
        io.to(`user_${session.userId}`).emit('rfq_updated', { rfqId: rfq._id, action: 'accept' });
      }
    }
    return { rfq, message: `RFQ ${action} recorded` };
  }

  // Buyer-only actions
  if (rfq.buyerId.toString() !== session.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 403;
    throw error;
  }

  if (['close', 'cancel', 'archive', 'publish', 'reopen', 'resubmit'].includes(action)) {
    const statusByAction = {
      close: 'closed',
      cancel: 'cancelled',
      archive: 'archived',
      publish: 'submitted',
      reopen: 'submitted',
      resubmit: 'submitted',
    };
    const previousStatus = rfq.status;
    const nextStatus = statusByAction[action];
    if (action === 'resubmit' && !['information_requested', 'rejected', 'draft'].includes(previousStatus)) throw Object.assign(new Error('RFQ is not waiting for buyer resubmission'), { statusCode: 409 });
    rfq.previousStatus = previousStatus;
    rfq.status = nextStatus;
    if (action === 'close') rfq.closedAt = new Date();
    rfq.activityTimeline.push({ action: `rfq_${action}`, status: rfq.status, message: body.reason || `RFQ ${action}`, actorId: session.userId, actorRole: 'buyer' });
    rfq.approvalHistory.push({ action: `rfq_${action}`, previousStatus, newStatus: nextStatus, actorId: session.userId, actorRole: 'buyer', notes: body.reason || body.notes });
    await rfq.save();
    return { rfq, message: 'RFQ status updated' };
  }

  // Update allowed fields
  const allowedFields = [
    'title', 'description', 'category', 'subcategory', 'specifications',
    'items', 'quantity', 'minimumOrderQuantity', 'unit', 'targetPrice',
    'currency', 'deliveryCountry', 'deliveryPort', 'deliveryTimeline', 'deliveryDate',
    'shippingPreference', 'drawings',
    'incoterms', 'attachments', 'images', 'documents', 'visibility', 'status',
  ];

  const changedFields = allowedFields.filter(key => body[key] !== undefined && JSON.stringify(body[key]) !== JSON.stringify(rfq[key]));
  if (changedFields.length) rfq.revisionHistory.push({ version: (rfq.revisionHistory?.length || 0) + 1, revisedAt: new Date(), revisedBy: session.userId, changedFields, notes: body.reason || body.notes || 'Buyer updated RFQ', documents: body.documents || body.attachments || [], snapshot: Object.fromEntries(allowedFields.map(key => [key, rfq[key]])) });

  Object.keys(body).forEach((key) => {
    if (allowedFields.includes(key)) {
      rfq[key] = body[key];
    }
  });

  await rfq.save();
  return { rfq, message: 'RFQ updated successfully' };
}

// ─── Delete (Archive) RFQ ──────────────────────────────────
export async function deleteRfq(session, rfqId) {
  const rfq = await rfqRepository.findRfqByIdLean(rfqId);

  if (!rfq) {
    const error = new Error('RFQ not found');
    error.statusCode = 404;
    throw error;
  }

  if (rfq.buyerId.toString() !== session.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 403;
    throw error;
  }

  rfq.status = 'archived';
  await rfq.save();

  return { message: 'RFQ archived successfully' };
}

// ─── Product Enquiry RFQ ───────────────────────────────────
export async function createProductEnquiry(session, body) {
  const productId = clean(body.productId);
  const sellerUserId = clean(body.sellerUserId);
  const quantity = Math.max(1, Number(body.quantity || 1));
  const unit = VALID_UNITS.includes(body.unit) ? body.unit : 'pcs';
  const deliveryCountry = clean(body.destinationCountry || body.deliveryCountry);

  const moderation = validateNoContactInfo({
    productName: body.productName,
    customSpecifications: body.customSpecifications,
    customizationRequirements: body.customizationRequirements,
    packagingRequirements: body.packagingRequirements,
    deliveryRequirements: body.deliveryRequirements,
    destinationCountry: deliveryCountry,
    additionalNotes: body.additionalNotes,
  });

  if (!moderation.ok) {
    const error = new Error(moderation.error);
    error.statusCode = 422;
    error.contactInfoBlocked = true;
    throw error;
  }

  if (!productId || !sellerUserId || !deliveryCountry) {
    const error = new Error(
      'Product, supplier, and destination country are required'
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    !mongoose.Types.ObjectId.isValid(productId) ||
    !mongoose.Types.ObjectId.isValid(sellerUserId)
  ) {
    const error = new Error(
      'Product, supplier, and destination country are required'
    );
    error.statusCode = 400;
    throw error;
  }

  if (String(session.userId) === sellerUserId) {
    const error = new Error('You cannot send an enquiry to yourself');
    error.statusCode = 400;
    throw error;
  }

  const Product = (await import('../models/Product.js')).default;
  const [product, seller] = await Promise.all([
    Product.findById(productId)
      .populate('sellerId', 'userId companyName isActive isSuspended')
      .lean()
      .exec(),
    rfqRepository.findSellerByUserId(sellerUserId),
  ]);

  if (!product) {
    const error = new Error('Product not found');
    error.statusCode = 404;
    throw error;
  }

  if (!seller) {
    const error = new Error('Supplier profile not found');
    error.statusCode = 404;
    throw error;
  }

  if (
    String(product.sellerId?._id || product.sellerId) !== String(seller._id) ||
    String(product.sellerId?.userId || '') !== String(sellerUserId)
  ) {
    const error = new Error('Selected product does not belong to this supplier');
    error.statusCode = 403;
    throw error;
  }

  if (!seller.isActive || seller.isSuspended) {
    const error = new Error('Supplier is not available for enquiries');
    error.statusCode = 403;
    throw error;
  }

  const description =
    [
      clean(body.customSpecifications),
      clean(body.customizationRequirements),
      clean(body.packagingRequirements),
      clean(body.deliveryRequirements),
      clean(body.additionalNotes),
    ]
      .filter(Boolean)
      .join('\n\n') || `Buyer requested a quotation for ${product.name}.`;

  const rfq = await rfqRepository.createRfq({
    buyerId: session.userId,
    productId: product._id,
    sellerId: seller._id,
    sellerUserId,
    rfqType: 'product',
    title: clean(body.productName) || `RFQ for ${product.name}`,
    description,
    category: product.category || 'General',
    subcategory: product.subcategory || '',
    specifications: clean(body.customSpecifications),
    items: [
      {
        productId: product._id,
        name: clean(body.productName) || product.name,
        category: product.category || 'General',
        subcategory: product.subcategory || '',
        quantity,
        unit,
        targetPrice: Number(body.targetPrice || 0),
        specifications: clean(body.customSpecifications),
        imageUrl: product.images?.[0] || '',
      },
    ],
    quantity,
    unit,
    targetPrice: Number(body.targetPrice || 0),
    currency: body.currency || product.currency || 'INR',
    deliveryCountry,
    deliveryTimeline: body.deliveryTimeline || 'flexible',
    incoterms: body.incoterms || 'FOB',
    attachments: normalizeFiles(body.attachments),
    specificSupplierIds: [seller._id],
    visibility: 'private',
    status: 'active',
    expiresAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
  });

  // Create conversation
  const { chat } = await findOrCreateConversation({
    buyerId: session.userId,
    sellerId: sellerUserId,
    productId: product._id,
    rfqId: rfq._id,
    chatType: 'rfq_negotiation',
  });

  rfq.conversationId = chat._id;
  await rfq.save();

  const Message = (await import('../models/Message.js')).default;
  const Notification = (await import('../models/Notification.js')).default;

  const content = buildRfqSummary({ rfq, product, body });

  const initialMessage = await Message.create({
    chatId: chat._id,
    senderId: session.userId,
    receiverId: sellerUserId,
    content,
    messageType: 'rfq',
    attachments: normalizeFiles(body.attachments).map((file) => ({
      url: file.url,
      type: file.type,
      name: file.filename,
    })),
    productDetails: {
      productId: product._id,
      productName: product.name,
      price: product.price,
      image: product.images?.[0] || '',
      productLink: `/products/${product._id}`,
      supplierName: seller.companyName || '',
      supplierId: seller._id,
      specifications: product.specifications || {},
    },
    rfqDetails: {
      rfqId: rfq._id,
      title: rfq.title,
      product: product.name,
      quantity: rfq.quantity,
      unit: rfq.unit,
      targetPrice: rfq.targetPrice,
      status: rfq.status,
      date: rfq.createdAt,
      actionUrl: `/dashboard/seller/rfqs/${rfq._id}`,
    },
  });

  await Message.insertMany([
    {
      chatId: chat._id,
      senderId: sellerUserId,
      receiverId: session.userId,
      content: `Welcome to ${seller.companyName || 'our supplier desk'}. We received your RFQ for ${product.name} and will review the requirement shortly.`,
      messageType: 'system',
      isRead: false,
    },
    {
      chatId: chat._id,
      senderId: sellerUserId,
      receiverId: session.userId,
      content: `RFQ summary: ${quantity.toLocaleString()} ${unit} for ${product.name}, destination ${deliveryCountry}.`,
      messageType: 'rfq',
      rfqDetails: {
        rfqId: rfq._id,
        title: rfq.title,
        product: product.name,
        quantity: rfq.quantity,
        unit: rfq.unit,
        targetPrice: rfq.targetPrice,
        status: rfq.status,
        date: rfq.createdAt,
        actionUrl: `/dashboard/buyer/rfqs/${rfq._id}`,
      },
    },
  ]);

  await Promise.all([
    RFQ.updateOne(
      { _id: rfq._id },
      { $addToSet: { viewedBySellerIds: sellerUserId } }
    ),
    Chat.updateOne(
      { _id: chat._id },
      {
        $set: {
          productId: product._id,
          rfqId: rfq._id,
          chatType: 'rfq_negotiation',
          lastMessage: 'RFQ received by supplier',
          lastMessageAt: new Date(),
        },
        $inc: { sellerUnreadCount: 1, buyerUnreadCount: 2 },
      }
    ),
    Notification.create({
      userId: sellerUserId,
      notificationType: 'rfq_created',
      title: 'New private RFQ received',
      description: `${session.user?.fullName || 'A buyer'} requested a quotation for ${product.name}`,
      data: {
        relatedId: rfq._id,
        relatedModel: 'RFQ',
        actionUrl: `/dashboard/seller/rfqs/${rfq._id}`,
      },
      priority: 'high',
    }),
  ]);

  const io = getIO();
  if (io) {
    io.to(`chat_${chat._id}`).emit('new_message', initialMessage);
    io.to(`chat_${chat._id}`).emit('rfq_updated', { chatId: String(chat._id), rfqId: String(rfq._id), status: rfq.status });
    io.to(`user_${sellerUserId}`).emit('new_notification', { type: 'rfq_created', rfqId: String(rfq._id), chatId: String(chat._id) });
  }

  return { rfq, chat, message: 'RFQ enquiry created successfully' };
}
