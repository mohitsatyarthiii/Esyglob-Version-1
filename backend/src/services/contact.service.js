import * as contactRepository from '../repositories/contact.repository.js';

function sideFor(chat, userId, requestedRole) {
  if (requestedRole === 'seller') return 'seller';
  if (requestedRole === 'buyer') return 'buyer';
  return String(chat.sellerId?._id || chat.sellerId) === String(userId) ? 'seller' : 'buyer';
}

function contactFromChat(chat, userId, requestedRole) {
  const side = sideFor(chat, userId, requestedRole);
  const isBuyerSide = side === 'buyer';
  const otherUser = isBuyerSide ? chat.sellerId : chat.buyerId;
  const savedAt = isBuyerSide ? chat.buyerSavedSupplierAt : chat.sellerSavedBuyerAt;
  const favoriteAt = isBuyerSide ? chat.buyerFavoriteAt : chat.sellerFavoriteAt;
  const blockedAt = isBuyerSide ? chat.buyerBlockedAt : chat.sellerBlockedAt;

  return {
    chatId: String(chat._id),
    userId: String(otherUser?._id || otherUser),
    name: otherUser?.fullName || otherUser?.email || (isBuyerSide ? 'Supplier' : 'Buyer'),
    email: otherUser?.email || '',
    avatarUrl: otherUser?.avatarUrl || '',
    type: isBuyerSide ? 'seller' : 'buyer',
    isSaved: Boolean(savedAt),
    isFavorite: Boolean(favoriteAt),
    isBlocked: Boolean(blockedAt),
    lastMessageAt: chat.lastMessageAt || chat.updatedAt || chat.createdAt,
  };
}

export async function getContacts(session, options = {}) {
  const requestedRole = options.role || session.primaryRole || 'buyer';
  const role = ['buyer', 'seller'].includes(requestedRole)
    ? requestedRole
    : session.primaryRole || 'buyer';

  const chats = await contactRepository.findUserChats(session.userId, 100);

  const contacts = chats.map((chat) => contactFromChat(chat, session.userId, role));

  // Enrich seller contacts with company names
  const sellerUserIds = contacts
    .filter((contact) => contact.type === 'seller')
    .map((contact) => contact.userId);

  const sellers = await contactRepository.findSellersByUserIds(sellerUserIds);
  const sellerByUser = new Map(
    sellers.map((seller) => [String(seller.userId), seller])
  );

  const enrichedContacts = contacts.map((contact) => {
    const seller = sellerByUser.get(contact.userId);
    return {
      ...contact,
      profileUrl: seller ? `/manufacturers/${seller._id}` : '',
      name: seller?.companyName || contact.name,
    };
  });

  return {
    savedBuyers: enrichedContacts.filter(
      (contact) => contact.type === 'buyer' && contact.isSaved
    ),
    savedSellers: enrichedContacts.filter(
      (contact) => contact.type === 'seller' && contact.isSaved
    ),
    favoriteContacts: enrichedContacts.filter((contact) => contact.isFavorite),
    recentContacts: enrichedContacts.slice(0, 30),
    blockedUsers: enrichedContacts.filter((contact) => contact.isBlocked),
  };
}


