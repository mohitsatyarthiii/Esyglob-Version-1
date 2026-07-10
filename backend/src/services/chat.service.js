import crypto from 'crypto';
import * as chatRepository from '../repositories/chat.repository.js';
import { findOrCreateConversation } from '../lib/chat-conversations.js';
import Chat from '../models/Chat.js';
import {
  isObjectId,
  normalizeObjectId,
  isGreeting,
  getAutoReplyIntent,
} from '../lib/chat-helpers.js';
import { validateNoContactInfo } from '../lib/contact-moderation.js';
import { getIO } from '../lib/socket.js';

// ─── Auto Reply ────────────────────────────────────────────
async function createSupplierAutoReply({ chat, chatId, buyerId, sellerUserId, content }) {
  const intent = getAutoReplyIntent(content);

  const [seller, product, sellerProfileProducts] = await Promise.all([
    chatRepository.findSellerByUserId(sellerUserId),
    chat.productId ? chatRepository.findProductById(chat.productId) : Promise.resolve(null),
    chatRepository.findSellerByUserIdLean(sellerUserId).then((sellerDoc) =>
      sellerDoc?._id ? chatRepository.findSellerProducts(sellerDoc._id, 4) : []
    ),
  ]);

  const supplierName = seller?.companyName || 'the supplier';
  const lines = [];

  if (intent === 'greeting') {
    if (/thank/.test(content.toLowerCase())) {
      lines.push(
        `You're welcome. ${supplierName} has received your message and will continue the conversation here.`
      );
    } else if (/bye|goodbye/.test(content.toLowerCase())) {
      lines.push(
        `Thank you for contacting ${supplierName}. The conversation is saved here for follow-up.`
      );
    } else {
      lines.push(`Hello, thank you for contacting ${supplierName}.`);
    }
    if (seller?.companyType) lines.push(`We are a ${seller.companyType} on EsyGlob.`);
    lines.push(
      'Please share your requirement, quantity, destination, and expected timeline here in chat.'
    );
  } else if (intent === 'catalog' || intent === 'product_or_supplier') {
    lines.push(
      `Thanks for your question. ${supplierName} will review your requirement here on EsyGlob.`
    );
    if (product?.name) {
      lines.push(`Product: ${product.name}.`);
      if (product.minimumOrderQuantity) lines.push(`MOQ: ${product.minimumOrderQuantity}.`);
      if (product.price) lines.push(`Listed price: ${product.price}.`);
      if (product.category)
        lines.push(
          `Category: ${product.category}${product.subcategory ? ` / ${product.subcategory}` : ''}.`
        );
      if (product.description)
        lines.push(`Description: ${String(product.description).slice(0, 180)}.`);
    }
    if (seller?.monthlyCapacity || seller?.productionCapacity)
      lines.push(`Production capacity: ${seller.monthlyCapacity || seller.productionCapacity}.`);
    if (seller?.factoryProfile?.factoryName)
      lines.push(`Factory: ${seller.factoryProfile.factoryName}.`);
    if (seller?.employeeCount) lines.push(`Employees: ${seller.employeeCount}.`);
    if (seller?.factoryArea) lines.push(`Factory area: ${seller.factoryArea}.`);
    if (seller?.productionLines) lines.push(`Production lines: ${seller.productionLines}.`);
    if (seller?.certifications?.length)
      lines.push(
        `Certifications: ${seller.certifications.slice(0, 3).map((c) => c.name || c).join(', ')}.`
      );
    if (seller?.exportMarkets?.length)
      lines.push(`Export markets: ${seller.exportMarkets.slice(0, 4).join(', ')}.`);
    if (seller?.paymentMethods?.length)
      lines.push(`Payment methods: ${seller.paymentMethods.slice(0, 4).join(', ')}.`);
    lines.push(
      'For an exact quotation, please send an RFQ with quantity, specifications, and delivery destination.'
    );
  } else {
    lines.push('Our supplier has received your inquiry and will respond as soon as possible.');
  }

  const createdMessages = [];
  const autoReply = await chatRepository.createMessage({
    chatId,
    senderId: sellerUserId,
    receiverId: buyerId,
    content: lines.join('\n'),
    messageType: 'system',
    isRead: false,
  });
  createdMessages.push(autoReply);

  if (intent === 'catalog' && sellerProfileProducts.length) {
    const productMessages = await chatRepository.createMessages(
      sellerProfileProducts.slice(0, 3).map((item) => ({
        chatId,
        senderId: sellerUserId,
        receiverId: buyerId,
        content: `${item.name}${item.minimumOrderQuantity ? `\nMOQ: ${item.minimumOrderQuantity}` : ''}${item.price ? `\nPrice: ${item.price}` : ''}`,
        messageType: 'product',
        productDetails: {
          productId: item._id,
          productName: item.name,
          price: item.price,
          image: item.images?.[0] || '',
          productLink: `/products/${item._id}`,
          supplierName,
          supplierId: chat.sellerId,
          specifications: {
            category: item.category,
            subcategory: item.subcategory,
            description: item.description,
          },
        },
        isRead: false,
      }))
    );
    createdMessages.push(...productMessages);
  }

  await chatRepository.updateChat(chatId, {
    $set: {
      lastMessage: createdMessages[createdMessages.length - 1]?.content || autoReply.content,
      lastMessageAt: new Date(),
    },
    $inc: { buyerUnreadCount: createdMessages.length },
  });

  await Promise.all(
    createdMessages.map((msg) => msg.populate('senderId', 'email fullName avatarUrl'))
  );
  return createdMessages;
}

// ─── Get Chat Messages ─────────────────────────────────────
export async function getChatMessages(user, chatId, options = {}) {
  const { limit = 30, before, after, markRead = true } = options;

  const chat = await chatRepository.findChatByIdPopulated(chatId, Boolean(after));

  if (!chat) {
    const error = new Error('Chat not found');
    error.statusCode = 404;
    throw error;
  }

  // Verify access
  const buyerId = String(chat.buyerId?._id || chat.buyerId);
  const sellerId = String(chat.sellerId?._id || chat.sellerId);
  const isBuyer = buyerId === user.id;
  const isSeller = sellerId === user.id;
  const isGroupMember = chat.groupMembers?.some(
    (member) => String(member._id || member) === user.id
  );

  if (!isBuyer && !isSeller && !isGroupMember) {
    const error = new Error('Unauthorized');
    error.statusCode = 403;
    throw error;
  }

  // Mark messages as read
  if (markRead && !after) {
    await chatRepository.markMessagesAsRead(chatId, user.id);
    await chatRepository.updateChat(chatId, {
      $set: isBuyer ? { buyerUnreadCount: 0 } : { sellerUnreadCount: 0 },
    });

    const io = getIO();
    if (io)
      io.to(`chat_${chatId}`).emit('messages_read', { userId: user.id, status: 'seen' });
  } else if (after) {
    await chatRepository.markMessagesAsDelivered(chatId, user.id);

    const io = getIO();
    if (io)
      io.to(`chat_${chatId}`).emit('messages_delivered', {
        userId: user.id,
        status: 'delivered',
      });
  }

  // Fetch messages
  const messages = await chatRepository.findMessages(chatId, { before, after, limit });

  // Fetch seller profile and products for buyer view
  let sellerProfile = null;
  let sellerProducts = [];
  let rfqProducts = [];

  if (!after && chat.chatType !== 'group') {
    sellerProfile = await chatRepository.findSellerForChat(sellerId);

    if (sellerProfile) {
      const [products, rfqs] = await Promise.all([
        chatRepository.findSellerProductsForChat(sellerProfile._id, 40),
        chatRepository.findRfqProducts(user.id, sellerId, chatId, chat.rfqId, 40),
      ]);

      sellerProducts = products;
      const seenProductIds = new Set();
      rfqProducts = rfqs
        .filter((rfq) => rfq.productId)
        .filter((rfq) => {
          const pid = String(rfq.productId?._id || rfq.productId);
          if (seenProductIds.has(pid)) return false;
          seenProductIds.add(pid);
          return true;
        })
        .map((rfq) => ({
          rfqId: rfq._id,
          rfqTitle: rfq.title,
          quantity: rfq.quantity,
          unit: rfq.unit,
          targetPrice: rfq.targetPrice,
          status: rfq.status,
          product: rfq.productId,
        }));
    }
  }

  return {
    chat: after ? undefined : chat,
    messages,
    sellerProfile,
    sellerProducts,
    rfqProducts,
  };
}

// ─── Send Message ──────────────────────────────────────────
export async function sendMessage(user, chatId, messageData) {
  const { content, messageType = 'text', attachments, productDetails, orderDetails, rfqDetails, quotationDetails } = messageData;
  const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 10) : [];

  if (!content?.trim() && safeAttachments.length === 0) {
    const error = new Error('Message content or attachment is required');
    error.statusCode = 400;
    throw error;
  }

  if (content?.trim().length > 5000) {
    const error = new Error('Message cannot exceed 5000 characters');
    error.statusCode = 422;
    throw error;
  }

  const moderation = validateNoContactInfo({
    content,
    attachments: safeAttachments,
    productDetails,
    orderDetails,
    rfqDetails,
    quotationDetails,
  });

  if (!moderation.ok) {
    const error = new Error(moderation.error);
    error.statusCode = 422;
    error.contactInfoBlocked = true;
    throw error;
  }

  const chat = await chatRepository.findChatById(chatId);
  if (!chat) {
    const error = new Error('Chat not found');
    error.statusCode = 404;
    throw error;
  }

  // Verify user belongs to chat
  const isBuyer = String(chat.buyerId) === user.id;
  const isSeller = String(chat.sellerId) === user.id;
  const isGroupMember = chat.groupMembers?.some((member) => String(member) === user.id);

  if (!isBuyer && !isSeller && !isGroupMember) {
    const error = new Error('Unauthorized');
    error.statusCode = 403;
    throw error;
  }

  const normalizedContent = content?.trim() || safeAttachments?.[0]?.name || 'Attachment';

  const groupReceiverId =
    chat.chatType === 'group'
      ? chat.groupMembers?.find((memberId) => String(memberId) !== user.id) || chat.sellerId
      : null;

  const receiverId = groupReceiverId || (isBuyer ? chat.sellerId : chat.buyerId);

  const message = await chatRepository.createMessage({
    chatId,
    senderId: user.id,
    receiverId,
    content: normalizedContent,
    messageType,
    attachments: safeAttachments,
    productDetails: productDetails || null,
    orderDetails: orderDetails || null,
    rfqDetails: rfqDetails || null,
    quotationDetails: quotationDetails || null,
    isRead: false,
  });

  // Update chat
  const chatUpdate = {
    $set: {
      lastMessage: normalizedContent,
      lastMessageAt: new Date(),
    },
  };

  if (chat.chatType !== 'group') {
    chatUpdate.$inc = isBuyer ? { sellerUnreadCount: 1 } : { buyerUnreadCount: 1 };
  }

  await chatRepository.updateChat(chatId, chatUpdate);

  // Create notification
  await chatRepository.createNotification({
    userId: receiverId,
    notificationType: 'message',
    title:
      chat.chatType === 'group'
        ? `New message in ${chat.groupName || 'Group Chat'}`
        : `New message from ${user.fullName || user.email}`,
    description: normalizedContent.substring(0, 100),
    data: {
      relatedId: chatId,
      relatedModel: 'Chat',
      actionUrl: `${isBuyer ? '/dashboard/seller/messages' : '/dashboard/buyer/messages'}?chatId=${chatId}`,
    },
  });

  // Auto-reply for buyer messages
  let autoReplies = [];
  if (isBuyer && chat.chatType !== 'group' && messageType === 'text') {
    autoReplies = await createSupplierAutoReply({
      chat,
      chatId,
      buyerId: user.id,
      sellerUserId: chat.sellerId,
      content: normalizedContent,
    });
  }

  await message.populate('senderId', 'email fullName avatarUrl');

  // Socket events
  const io = getIO();
  if (io) {
    io.to(`chat_${chatId}`).emit('new_message', message);
    autoReplies.forEach((autoReply) =>
      io.to(`chat_${chatId}`).emit('new_message', autoReply)
    );
    io.to(`user_${receiverId}`).emit('new_notification', {
      type: 'message',
      chatId,
      message: normalizedContent,
    });
  }

  return {
    message,
    autoReply: autoReplies[0] || null,
    autoReplies,
  };
}

// ─── Chat Actions ──────────────────────────────────────────
export async function performChatAction(user, chatId, actionData) {
  const { action, value, label, productId } = actionData;

  const chat = await chatRepository.findChatById(chatId);
  if (!chat) {
    const error = new Error('Chat not found');
    error.statusCode = 404;
    throw error;
  }

  const isBuyer = String(chat.buyerId) === user.id;
  const isSeller = String(chat.sellerId) === user.id;
  const isGroupMember = chat.groupMembers?.some((member) => String(member) === user.id);

  if (!isBuyer && !isSeller && !isGroupMember) {
    const error = new Error('Unauthorized');
    error.statusCode = 403;
    throw error;
  }

  const now = new Date();

  // ─── Enable Order ─────────────────────────────
  if (action === 'enable_order') {
    if (!isSeller || chat.chatType === 'group') {
      const error = new Error('Only the seller can enable Start Order for this conversation');
      error.statusCode = 403;
      throw error;
    }

    const candidateProductId = productId || chat.productId;
    if (!candidateProductId) {
      const error = new Error('Product context is required to enable Start Order');
      error.statusCode = 400;
      throw error;
    }
    if (!isObjectId(candidateProductId)) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }

    const [seller, product] = await Promise.all([
      chatRepository.findSellerByUserIdLean(user.id),
      chatRepository.findProductById(candidateProductId),
    ]);

    if (!seller) {
      const error = new Error('Seller profile not found');
      error.statusCode = 404;
      throw error;
    }
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }
    if (String(product.sellerId) !== String(seller._id)) {
      const error = new Error('You can enable orders only for your own products');
      error.statusCode = 403;
      throw error;
    }

    const linkedRfq = await chatRepository.findRfqById(chat.rfqId);
    if (!linkedRfq) {
      const error = new Error(
        'Start Order can be enabled only for products with an RFQ in this conversation'
      );
      error.statusCode = 409;
      throw error;
    }

    const existing = chat.orderEligibility?.find(
      (item) => String(item.productId?._id || item.productId) === String(product._id)
    );

    if (existing) {
      existing.isActive = true;
      existing.enabledBy = user.id;
      existing.enabledAt = now;
    } else {
      chat.orderEligibility = chat.orderEligibility || [];
      chat.orderEligibility.push({
        productId: product._id,
        enabledBy: user.id,
        enabledAt: now,
        isActive: true,
      });
    }

    chat.productId = chat.productId || product._id;
    chat.lastMessage = `Start Order enabled for ${product.name}`;
    chat.lastMessageAt = now;
    chat.buyerUnreadCount = (chat.buyerUnreadCount || 0) + 1;
    await chat.save();

    const message = await chatRepository.createMessage({
      chatId,
      senderId: user.id,
      receiverId: chat.buyerId,
      content: `Start Order is now available for ${product.name}.`,
      messageType: 'action',
      actionType: 'start_order',
      productDetails: {
        productId: product._id,
        productName: product.name,
        price: product.price,
        image: product.images?.[0] || '',
        productLink: `/products/${product._id}`,
        supplierName: seller.companyName || '',
        supplierId: seller._id,
      },
      orderDetails: {
        productId: product._id,
        rfqId: linkedRfq._id,
        orderStatus: 'ready_for_order',
        actionUrl: `/dashboard/buyer/trade-order?chatId=${chatId}&productId=${product._id}`,
      },
      isRead: false,
      deliveryStatus: 'sent',
    });

    await message.populate('senderId', 'email fullName avatarUrl');

    await chatRepository.createNotification({
      userId: chat.buyerId,
      notificationType: 'message',
      title: 'Start Order enabled',
      description: `${seller.companyName || 'Seller'} enabled Start Order for ${product.name}`,
      data: {
        relatedId: chatId,
        relatedModel: 'Chat',
        actionUrl: `/dashboard/buyer/messages?chatId=${chatId}`,
      },
      priority: 'high',
    });

    const updated = await chatRepository.findChatByIdPopulated(chatId);

    const io = getIO();
    if (io) {
      io.to(`chat_${chatId}`).emit('new_message', message);
      io.to(`user_${chat.buyerId}`).emit('new_notification', {
        type: 'message',
        chatId,
        message: message.content,
      });
    }

    return { chat: updated, message };
  }

  // ─── Other Actions ────────────────────────────
  const side = isBuyer ? 'buyer' : 'seller';
  const setDate = value === false ? null : now;
  const updates = {};

  if (action === 'pin') updates[`${side}PinnedAt`] = setDate;
  else if (action === 'archive') updates[`${side}ArchivedAt`] = setDate;
  else if (action === 'mute') updates[`${side}MutedAt`] = setDate;
  else if (action === 'block') updates[`${side}BlockedAt`] = setDate;
  else if (action === 'favorite') updates[`${side}FavoriteAt`] = setDate;
  else if (action === 'save_supplier')
    updates[isBuyer ? 'buyerSavedSupplierAt' : 'sellerSavedBuyerAt'] = setDate;
  else if (action === 'label')
    updates[`${side}Label`] = String(label || '').trim().slice(0, 40);
  else if (action === 'delete') updates[`${side}DeletedAt`] = now;
  else if (action === 'mark_read') {
    await chatRepository.markMessagesAsRead(chatId, user.id);
    updates[`${side}UnreadCount`] = 0;
  } else if (action === 'mark_unread') {
    const latestIncoming = await chatRepository.findLatestIncomingMessage(chatId, user.id);
    if (latestIncoming) {
      latestIncoming.isRead = false;
      latestIncoming.readAt = null;
      await latestIncoming.save();
    }
    updates[`${side}UnreadCount`] = Math.max(1, chat[`${side}UnreadCount`] || 0);
  } else {
    const error = new Error('Invalid chat action');
    error.statusCode = 400;
    throw error;
  }

  const updated = await chatRepository.updateChatLean(chatId, { $set: updates });
  return { chat: updated };
}

// ─── Chat List ─────────────────────────────────────────────
export async function getChatList(session, options = {}) {
  const { rfqId, role: requestedRole, view = 'active', unreadOnly = false, label, limit = 30 } = options;

  const query = {
    $or: [
      { buyerId: session.userId },
      { sellerId: session.userId },
      { groupMembers: session.userId },
    ],
    isActive: true,
  };

  const USER_ROLES = { BUYER: 'buyer', SELLER: 'seller', ADMIN: 'admin' };

  if (requestedRole === USER_ROLES.BUYER && session.roles?.includes(USER_ROLES.BUYER)) {
    query.$or = [{ buyerId: session.userId }, { groupMembers: session.userId }];
    if (view === 'archived') query.buyerArchivedAt = { $ne: null };
    else query.buyerArchivedAt = null;
    query.buyerDeletedAt = null;
    if (view === 'blocked') query.buyerBlockedAt = { $ne: null };
    else query.buyerBlockedAt = null;
    if (unreadOnly) query.buyerUnreadCount = { $gt: 0 };
    if (view === 'favorites') query.buyerFavoriteAt = { $ne: null };
    if (label) query.buyerLabel = label;
  } else if (requestedRole === USER_ROLES.SELLER && session.roles?.includes(USER_ROLES.SELLER)) {
    query.$or = [{ sellerId: session.userId }, { groupMembers: session.userId }];
    if (view === 'archived') query.sellerArchivedAt = { $ne: null };
    else query.sellerArchivedAt = null;
    query.sellerDeletedAt = null;
    if (view === 'blocked') query.sellerBlockedAt = { $ne: null };
    else query.sellerBlockedAt = null;
    if (unreadOnly) query.sellerUnreadCount = { $gt: 0 };
    if (view === 'favorites') query.sellerFavoriteAt = { $ne: null };
    if (label) query.sellerLabel = label;
  } else if (session.primaryRole === USER_ROLES.BUYER) {
    query.buyerArchivedAt = null;
    query.buyerBlockedAt = null;
    query.buyerDeletedAt = null;
  } else if (session.primaryRole === USER_ROLES.SELLER) {
    query.sellerArchivedAt = null;
    query.sellerBlockedAt = null;
    query.sellerDeletedAt = null;
  }

  if (rfqId && isObjectId(rfqId)) {
    query.rfqId = rfqId;
  }

  const sort =
    requestedRole === USER_ROLES.SELLER
      ? { sellerPinnedAt: -1, lastMessageAt: -1 }
      : { buyerPinnedAt: -1, lastMessageAt: -1 };

  const chatResults = await chatRepository.findChatsByUser(session.userId, query, limit, sort);

  // Deduplicate
  const seenPairs = new Set();
  const chats = chatResults
    .filter((chat) => {
      if (chat.chatType === 'group') return true;
      const pairKey = `${chat.buyerId?._id || chat.buyerId}:${chat.sellerId?._id || chat.sellerId}`;
      if (seenPairs.has(pairKey)) return false;
      seenPairs.add(pairKey);
      return true;
    })
    .slice(0, limit)
    .map((chat) => {
      const side = String(chat.sellerId?._id || chat.sellerId) === String(session.userId)
        ? 'seller'
        : 'buyer';
      return {
        ...chat,
        isArchived: Boolean(chat[`${side}ArchivedAt`]),
        isPinned: Boolean(chat[`${side}PinnedAt`]),
        isMuted: Boolean(chat[`${side}MutedAt`]),
        isFavorite: Boolean(chat[`${side}FavoriteAt`]),
        isDeletedForMe: Boolean(chat[`${side}DeletedAt`]),
        label: chat[`${side}Label`] || '',
      };
    });

  return { chats };
}

// ─── Create Chat ───────────────────────────────────────────
export async function createChat(session, chatData) {
  const {
    otherUserId: rawOtherUserId,
    productId: rawProductId,
    rfqId: rawRfqId,
    quotationId: rawQuotationId,
    chatType = 'general',
    role,
    enquiry = false,
  } = chatData;

  const otherUserId = normalizeObjectId(rawOtherUserId);
  const productId = normalizeObjectId(rawProductId);
  const rfqId = normalizeObjectId(rawRfqId);
  const quotationId = normalizeObjectId(rawQuotationId);

  if (enquiry && !rfqId) {
    const error = new Error('Product enquiries must be submitted as RFQs');
    error.statusCode = 400;
    throw error;
  }

  if (!otherUserId) {
    const error = new Error('Valid seller user ID is required');
    error.statusCode = 400;
    throw error;
  }

  if (session.userId === otherUserId) {
    const error = new Error('You cannot chat with yourself');
    error.statusCode = 400;
    throw error;
  }

  const otherUser = await chatRepository.findUserById(otherUserId);
  if (!otherUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const USER_ROLES = { BUYER: 'buyer', SELLER: 'seller', ADMIN: 'admin' };
  const canBuy = session.roles?.includes(USER_ROLES.BUYER);
  const canSell = session.roles?.includes(USER_ROLES.SELLER);
  const otherCanBuy = otherUser.roles?.includes(USER_ROLES.BUYER);
  const otherCanSell = otherUser.roles?.includes(USER_ROLES.SELLER);

  const isBuyer =
    role === USER_ROLES.BUYER
      ? canBuy && otherCanSell
      : canBuy && otherCanSell && (!canSell || !otherCanBuy || session.primaryRole === USER_ROLES.BUYER);

  const isSeller =
    role === USER_ROLES.SELLER
      ? canSell && otherCanBuy
      : canSell && otherCanBuy && (!canBuy || !otherCanSell || session.primaryRole === USER_ROLES.SELLER);

  let buyerId, sellerId;

  if (isBuyer) {
    buyerId = session.userId;
    sellerId = otherUserId;
  } else if (isSeller) {
    buyerId = otherUserId;
    sellerId = session.userId;
  } else {
    const error = new Error('Invalid active role');
    error.statusCode = 403;
    throw error;
  }

  if (String(buyerId) === String(sellerId)) {
    const error = new Error('Buyer and seller cannot be same');
    error.statusCode = 400;
    throw error;
  }

  const conversation = await findOrCreateConversation({
    buyerId,
    sellerId,
    productId,
    rfqId,
    quotationId,
    chatType: enquiry ? 'product_enquiry' : chatType,
  });

  if (rfqId) {
    const rfq = await chatRepository.findRfqById(rfqId);
    if (rfq && rfq.status === 'pending') {
      rfq.status = 'viewed';
      rfq.viewedBySellerIds = rfq.viewedBySellerIds || [];
      if (!rfq.viewedBySellerIds.some((id) => id.toString() === sellerId)) {
        rfq.viewedBySellerIds.push(sellerId);
      }
      await rfq.save();
    }
  }

  await conversation.chat.populate('buyerId', 'email fullName avatarUrl');
  await conversation.chat.populate('sellerId', 'email fullName avatarUrl');
  await conversation.chat.populate('productId', 'name images');
  if (rfqId) await conversation.chat.populate('rfqId', 'title quantity');
  if (quotationId) await conversation.chat.populate('quotationId', 'unitPrice status');

  return { chat: conversation.chat, created: conversation.created };
}

// ─── Create Group Chat ─────────────────────────────────────
export async function createGroupChat(session, groupData) {
  const { groupName, memberIds, role } = groupData;

  const uniqueMembers = [...new Set(memberIds.filter((id) => id !== session.userId))];
  const members = await chatRepository.findActiveUsers(uniqueMembers);

  if (!members.length) {
    const error = new Error('Select at least one valid contact');
    error.statusCode = 422;
    throw error;
  }

  const allMemberIds = [session.userId, ...members.map((m) => String(m._id))];

  let chat;
  try {
    chat = await Chat.create({
      pairKey: `group:${crypto.randomUUID()}`,
      buyerId: session.userId,
      sellerId: members[0]._id,
      chatType: 'group',
      groupName,
      groupMembers: allMemberIds,
      groupCreatedBy: session.userId,
      lastMessage: `${groupName} created`,
      lastMessageAt: new Date(),
    });
  } catch (error) {
    if (error?.code !== 11000 || !error?.keyPattern?.buyerId || !error?.keyPattern?.sellerId) {
      throw error;
    }

    // Repair legacy unique index
    const indexes = await Chat.collection.indexes();
    const legacyIndex = indexes.find(
      (idx) =>
        idx.name === 'buyerId_1_sellerId_1' &&
        idx.unique === true &&
        idx.key?.buyerId === 1 &&
        idx.key?.sellerId === 1
    );

    if (legacyIndex) {
      await Chat.collection.dropIndex('buyerId_1_sellerId_1');
      await Chat.collection.createIndex(
        { buyerId: 1, sellerId: 1 },
        { name: 'buyerId_1_sellerId_1' }
      );
    }

    chat = await Chat.create({
      pairKey: `group:${crypto.randomUUID()}`,
      buyerId: session.userId,
      sellerId: members[0]._id,
      chatType: 'group',
      groupName,
      groupMembers: allMemberIds,
      groupCreatedBy: session.userId,
      lastMessage: `${groupName} created`,
      lastMessageAt: new Date(),
    });
  }

  await chatRepository.createMessage({
    chatId: chat._id,
    senderId: session.userId,
    receiverId: members[0]._id,
    content: `${groupName} created`,
    messageType: 'system',
    isRead: true,
    readAt: new Date(),
  });

  await chat.populate('buyerId', 'email fullName avatarUrl');
  await chat.populate('sellerId', 'email fullName avatarUrl');
  await chat.populate('groupMembers', 'email fullName avatarUrl');
  await chat.populate('groupCreatedBy', 'email fullName avatarUrl');

  return { chat };
}
