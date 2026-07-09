import Chat from '../models/Chat.js';

export function getConversationKey(buyerId, sellerId) {
  return `${String(buyerId)}:${String(sellerId)}`;
}

export async function findExistingConversation(buyerId, sellerId) {
  return Chat.findOne({ buyerId, sellerId, isActive: true }).sort({
    lastMessageAt: -1,
    updatedAt: -1,
  });
}

export async function findOrCreateConversation({
  buyerId,
  sellerId,
  productId,
  rfqId,
  quotationId,
  chatType = 'general',
}) {
  const pairKey = getConversationKey(buyerId, sellerId);
  let chat = await findExistingConversation(buyerId, sellerId);
  let created = false;

  const contextUpdates = {
    pairKey,
    isActive: true,
  };

  if (productId) contextUpdates.productId = productId;
  if (rfqId) contextUpdates.rfqId = rfqId;
  if (quotationId) contextUpdates.quotationId = quotationId;
  if (['general', 'product_enquiry', 'rfq_negotiation', 'order_support'].includes(chatType)) {
    contextUpdates.chatType = chatType;
  }
  if (rfqId || quotationId || chatType === 'rfq_negotiation') {
    contextUpdates.chatType = 'rfq_negotiation';
  }

  if (chat) {
    chat.set(contextUpdates);
    try {
      await chat.save();
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existingPairChat = await Chat.findOne({ pairKey, isActive: true }).sort({
        lastMessageAt: -1,
        updatedAt: -1,
      });
      if (existingPairChat) return { chat: existingPairChat, created };
    }
    return { chat, created };
  }

  try {
    chat = await Chat.findOneAndUpdate(
      { pairKey },
      {
        $setOnInsert: {
          buyerId,
          sellerId,
          buyerUnreadCount: 0,
          sellerUnreadCount: 0,
        },
        $set: contextUpdates,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );
    created = true;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    chat = await Chat.findOne({ pairKey });
  }

  return { chat, created };
}
