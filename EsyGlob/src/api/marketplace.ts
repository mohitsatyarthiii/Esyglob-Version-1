import { ApiError, apiRequest } from './client';
import { normalizeList, unwrapData } from './normalizers';
import {
  Chat,
  ChatDetails,
  CheckoutQuote,
  MessageItem,
  NotificationItem,
  Order,
  PaymentInitiation,
  Product,
  Quotation,
  QuotationListResponse,
  RFQ,
  RFQDetails,
  ReviewItem,
  ReviewSummary,
  SellerDetails,
  SellerSummary,
} from './types';

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { fetchCategories, fetchCategoryDetails } from './categories';
export { fetchHome } from './home';
export { fetchProducts, fetchProductDetails } from './products';
export { searchMarketplace } from './search';

// ─── Types ──────────────────────────────────────────────────────────────────

export type UploadAttachment = {
  id?: string;
  url?: string;
  secure_url?: string;
  location?: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

export type EnquiryAttachment = {
  filename?: string;
  type?: string;
  url?: string;
};

// In marketplace.js or types.ts
export type EnquiryInput = {
  productId: string;
  sellerUserId: string;
  productName?: string;
  quantity: number;
  unit?: string;
  targetPrice?: number;
  customSpecifications?: string;
  customizationRequirements?: string;
  packagingRequirements?: string;
  deliveryRequirements?: string;
  destinationCountry: string;
  additionalNotes?: string;
  attachments?: EnquiryAttachment[];
  currency?: string;
  deliveryTimeline?: string;
  incoterms?: string;
};

// ─── RFQs ───────────────────────────────────────────────────────────────────

export async function fetchRFQs(params: {
  scope?: 'buyer' | 'seller' | 'public';
  status?: string;
  category?: string;
  country?: string;
  search?: string;
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
} = {}) {
  const payload = await apiRequest('/rfqs', {
    query: {
      ...params,
      scope: params.scope === 'public' ? undefined : params.scope,
      q: params.q ?? params.search,
      limit: params.limit ?? 20,
    },
  });
  const data = unwrapData<{ rfqs?: RFQ[]; pagination?: unknown } | RFQ[]>(payload);

  return {
    rfqs: Array.isArray(data)
      ? data
      : data?.rfqs ?? normalizeList<RFQ>(payload, ['rfqs', 'items', 'results']),
    pagination: Array.isArray(data) ? undefined : data?.pagination,
  };
}

export async function fetchRFQDetails(rfqId: string): Promise<RFQDetails> {
  const payload = await apiRequest(`/rfqs/${rfqId}`);
  return unwrapData<RFQDetails>(payload);
}

export async function createRFQ(input: Record<string, unknown>): Promise<RFQ> {
  const payload = await apiRequest('/rfqs', { method: 'POST', body: input });
  const data = unwrapData<{ rfq?: RFQ } | RFQ>(payload);
  const rfq = data && typeof data === 'object' && 'rfq' in data ? data.rfq : data;
  if (!rfq) throw new Error('RFQ was not returned by the backend.');
  return rfq as RFQ;
}

export async function updateRFQ(rfqId: string, input: Record<string, unknown>): Promise<RFQ> {
  const payload = await apiRequest(`/rfqs/${rfqId}`, { method: 'PATCH', body: input });
  const data = unwrapData<{ rfq?: RFQ } | RFQ>(payload);
  const rfq = data && typeof data === 'object' && 'rfq' in data ? data.rfq : data;
  if (!rfq) throw new Error('RFQ was not returned by the backend.');
  return rfq as RFQ;
}

export async function archiveRFQ(rfqId: string) {
  const payload = await apiRequest(`/rfqs/${rfqId}`, { method: 'DELETE' });
  return unwrapData(payload);
}

// ─── Product Enquiry / Chat ─────────────────────────────────────────────────

// ─── Product Enquiry / Chat ─────────────────────────────────────────────────

export async function createProductEnquiry(input: EnquiryInput) {
  // FIXED: Use the correct endpoint from the backend
  const payload = await apiRequest('/rfqs/product-enquiry', {
    method: 'POST',
    body: {
      productId: input.productId,
      sellerUserId: input.sellerUserId,
      productName: input.productName || 'Product',
      quantity: input.quantity || 1,
      unit: input.unit || 'pcs',
      targetPrice: input.targetPrice,
      customSpecifications: input.customSpecifications,
      customizationRequirements: input.customizationRequirements,
      packagingRequirements: input.packagingRequirements,
      deliveryRequirements: input.deliveryRequirements,
      destinationCountry: input.destinationCountry || 'India',
      additionalNotes: input.additionalNotes,
      attachments: input.attachments || [],
      currency: input.currency || 'INR',
      deliveryTimeline: input.deliveryTimeline || 'flexible',
      incoterms: input.incoterms || 'FOB',
    },
  });
  
  const data = unwrapData<{ rfq?: RFQ; chat?: Chat; message?: string }>(payload);
  
  // FIXED: The backend returns { rfq, chat, message }
  if (!data) {
    throw new Error('No response from server');
  }
  
  // Check if we have the required data
  if (data.chat || data.rfq) {
    return data;
  }
  
  // Check if the response is wrapped differently
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (p.rfq || p.chat || p.success) {
      return payload as any;
    }
  }
  
  throw new Error('Enquiry response did not include RFQ or conversation.');
}

export async function startProductChat(input: {
  otherUserId: string;
  productId?: string;
  role?: 'buyer' | 'seller';
  enquiry?: boolean;
}) {
  // FIXED: Ensure required fields
  if (!input.otherUserId) {
    throw new Error('Seller user ID is required');
  }

  const payload = await apiRequest('/chat', {
    method: 'POST',
    body: {
      otherUserId: input.otherUserId,
      productId: input.productId || undefined,
      role: input.role || 'buyer',
      enquiry: input.enquiry || false,
    },
  });
  
  const data = unwrapData<{ chat?: Chat; created?: boolean }>(payload);
  
  if (!data?.chat) {
    // Check if the response has a chat nested differently
    if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      if (p.chat) {
        return { chat: p.chat as Chat, created: p.created as boolean || false };
      }
      if (p.data && typeof p.data === 'object') {
        const d = p.data as Record<string, unknown>;
        if (d.chat) {
          return { chat: d.chat as Chat, created: d.created as boolean || false };
        }
      }
    }
    throw new Error('Conversation was not returned by the backend.');
  }
  
  return data;
}



// ─── Track Product View ─────────────────────────────────────────────────────

export async function trackProductView(productId: string) {
  return apiRequest('/buyer/recently-viewed', {
    method: 'POST',
    body: { productId },
  }).catch(() => null);
}

// ─── Sellers ────────────────────────────────────────────────────────────────

export async function fetchSellers(params: {
  q?: string;
  search?: string;
  page?: number;
  limit?: number;
  isVerified?: boolean;
  sort?: string;
} = {}) {
  const payload = await apiRequest('/suppliers', {
    query: params,
    cacheTtlMs: 2 * 60_000,
  });
  const data = unwrapData<{ sellers?: SellerSummary[]; pagination?: unknown }>(payload);

  return {
    sellers: data?.sellers ?? normalizeList<SellerSummary>(payload, ['sellers']),
    pagination: data?.pagination,
  };
}

export async function fetchSellerDetails(sellerId: string): Promise<SellerDetails> {
  try {
    // FIXED: Use /suppliers (not /sellers) to match backend
    const payload = await apiRequest(`/suppliers/${sellerId}`, { 
      cacheTtlMs: 2 * 60_000 
    });
    return unwrapData<SellerDetails>(payload);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
  }

  // Fallback: Try the list endpoint
  try {
    const [sellerPayload, productsPayload, reviewsPayload] = await Promise.all([
      apiRequest('/suppliers', { query: { limit: 100 }, cacheTtlMs: 2 * 60_000 }),
      apiRequest('/products', {
        query: { type: 'homepage', seller: sellerId, limit: 30 },
        cacheTtlMs: 2 * 60_000,
      }),
      apiRequest('/reviews', {
        query: { sellerId, limit: 20 },
        cacheTtlMs: 60_000,
      }).catch(() => null),
    ]);

    const sellers =
      unwrapData<{ sellers?: SellerSummary[] }>(sellerPayload)?.sellers ??
      normalizeList<SellerSummary>(sellerPayload, ['sellers']);
    const seller = sellers.find(item => item._id === sellerId || item.id === sellerId);

    if (!seller) throw new Error('Seller details were not returned by the backend.');

    return {
      seller,
      products: normalizeList<Product>(productsPayload, ['products']),
      reviews: reviewsPayload
        ? normalizeList<Record<string, unknown>>(reviewsPayload, ['reviews'])
        : [],
    };
  } catch {
    // If all fails, try to get just the seller profile
    const payload = await apiRequest(`/suppliers/${sellerId}`, { 
      cacheTtlMs: 2 * 60_000 
    });
    return unwrapData<SellerDetails>(payload);
  }
}

// ─── Seller Onboarding ──────────────────────────────────────────────────────

export async function fetchSellerOnboarding(): Promise<{
  seller?: SellerSummary;
  verification?: Record<string, unknown>;
  completion?: Record<string, unknown>;
  verificationCenter?: Record<string, unknown>;
  draftAvailable?: boolean;
}> {
  const payload = await apiRequest('/suppliers/me');
  return unwrapData(payload);
}

export async function archiveSellerDocument(documentId: string) {
  const payload = await apiRequest(`/suppliers/verification/documents/${documentId}`, { method: 'DELETE' });
  return unwrapData(payload);
}

export async function saveSellerOnboarding(input: Record<string, unknown>, submitForVerification = false) {
  const payload = await apiRequest('/suppliers/profile', {
    method: 'PATCH',
    body: { ...input, submitForVerification },
  });
  return unwrapData(payload);
}

// ─── Factory Profile ────────────────────────────────────────────────────────

export async function fetchFactoryProfile(): Promise<{
  factory?: Record<string, unknown> | null;
  seller?: SellerSummary;
}> {
  const payload = await apiRequest('/suppliers/me');
  return unwrapData(payload);
}

export async function saveFactoryProfile(input: Record<string, unknown>) {
  const payload = await apiRequest('/suppliers/profile', {
    method: 'PATCH',
    body: input,
  });
  return unwrapData(payload);
}

// ─── Upload ─────────────────────────────────────────────────────────────────

export async function uploadSellerDocument(
  documentType: string,
  file: { uri: string; name: string; type: string },
) {
  const form = new FormData();
  form.append('documentType', documentType);
  form.append('file', file as unknown as Blob);
  const payload = await apiRequest('/upload', { method: 'POST', body: form });
  return unwrapData(payload);
}

export async function uploadFiles(
  folder: string,
  files: Array<{ uri: string; name: string; type: string }>,
): Promise<{ uploads?: UploadAttachment[]; files?: UploadAttachment[] }> {
  const form = new FormData();
  form.append('folder', folder);
  files.forEach(file => form.append('files', file as unknown as Blob));
  const payload = await apiRequest('/upload', { method: 'POST', body: form });
  return unwrapData(payload);
}

// ─── Reviews ────────────────────────────────────────────────────────────────

export async function fetchReviews(
  params: {
    productId?: string;
    sellerId?: string;
    mine?: boolean;
    sellerDashboard?: boolean;
    limit?: number;
  } = {},
): Promise<ReviewSummary> {
  const payload = await apiRequest('/reviews', { query: params });
  const data = unwrapData<Partial<ReviewSummary>>(payload) ?? {};
  const breakdown = data.breakdown ?? { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };

  return {
    reviews:
      data.reviews ?? normalizeList<ReviewItem>(payload, ['reviews', 'items', 'results']),
    averageRating: Number(data.averageRating ?? 0),
    reviewCount: Number(data.reviewCount ?? data.reviews?.length ?? 0),
    breakdown: {
      '5': Number(breakdown['5'] ?? 0),
      '4': Number(breakdown['4'] ?? 0),
      '3': Number(breakdown['3'] ?? 0),
      '2': Number(breakdown['2'] ?? 0),
      '1': Number(breakdown['1'] ?? 0),
    },
  };
}

export async function createReview(input: Record<string, unknown>): Promise<ReviewItem> {
  const payload = await apiRequest('/reviews', { method: 'POST', body: input });
  const data = unwrapData<{ review?: ReviewItem } | ReviewItem>(payload);
  return (data && typeof data === 'object' && 'review' in data ? data.review : data) as ReviewItem;
}

export async function updateReview(input: Record<string, unknown>): Promise<ReviewItem> {
  const payload = await apiRequest('/reviews', { method: 'PUT', body: input });
  const data = unwrapData<{ review?: ReviewItem } | ReviewItem>(payload);
  return (data && typeof data === 'object' && 'review' in data ? data.review : data) as ReviewItem;
}

export async function respondToReview(
  reviewId: string,
  input: { comment: string },
): Promise<ReviewItem> {
  const payload = await apiRequest(`/reviews/${reviewId}/respond`, {
    method: 'PATCH',
    body: input,
  });
  const data = unwrapData<{ review?: ReviewItem } | ReviewItem>(payload);
  return (data && typeof data === 'object' && 'review' in data ? data.review : data) as ReviewItem;
}

// ─── Seller Products ────────────────────────────────────────────────────────

export async function fetchSellerProducts(
  params: { q?: string; status?: string; page?: number; limit?: number } = {},
) {
  const payload = await apiRequest('/products', {
    query: { type: 'seller', ...params, limit: params.limit ?? 30 },
  });
  const data = unwrapData<{ products?: Product[]; pagination?: unknown }>(payload);
  return {
    products: data?.products ?? normalizeList<Product>(payload, ['products']),
    pagination: data?.pagination,
  };
}

export async function fetchSellerProductDetails(productId: string): Promise<Product> {
  const payload = await apiRequest(`/products/${productId}`);
  const data = unwrapData<{ product?: Product } | Product>(payload);
  const product =
    data && typeof data === 'object' && 'product' in data ? data.product : data;
  if (!product) throw new Error('Seller product details were not returned.');
  return product as Product;
}

export async function createSellerProduct(
  input: Record<string, unknown>,
): Promise<{ product?: Product; visibilityNotice?: string }> {
  const payload = await apiRequest('/products', { method: 'POST', body: input });
  return unwrapData(payload);
}

export async function updateSellerProduct(
  productId: string,
  input: Record<string, unknown>,
): Promise<{ product?: Product; visibilityNotice?: string }> {
  const payload = await apiRequest(`/products/${productId}`, { method: 'PATCH', body: input });
  return unwrapData(payload);
}

export async function deleteSellerProduct(productId: string) {
  const payload = await apiRequest(`/products/${productId}`, { method: 'DELETE' });
  return unwrapData(payload);
}

// ─── Quotations ─────────────────────────────────────────────────────────────

export async function fetchQuotations(
  params: { rfqId?: string; status?: string; page?: number; limit?: number } = {},
): Promise<QuotationListResponse> {
  const payload = await apiRequest('/quotations', { query: params });
  const data = unwrapData<QuotationListResponse | Quotation[]>(payload);
  return {
    quotations: Array.isArray(data)
      ? data
      : data?.quotations ?? normalizeList<Quotation>(payload, ['quotations']),
    pagination: Array.isArray(data) ? undefined : data?.pagination,
  };
}

export async function fetchQuotationDetails(quotationId: string): Promise<Quotation> {
  const payload = await apiRequest(`/quotations/${quotationId}`);
  const data = unwrapData<{ quotation?: Quotation } | Quotation>(payload);
  const quotation =
    data && typeof data === 'object' && 'quotation' in data ? data.quotation : data;
  if (!quotation) throw new Error('Quotation details were not returned.');
  return quotation as Quotation;
}

export async function createQuotation(input: Record<string, unknown>): Promise<Quotation> {
  const payload = await apiRequest('/quotations', { method: 'POST', body: input });
  const data = unwrapData<{ quotation?: Quotation } | Quotation>(payload);
  const quotation =
    data && typeof data === 'object' && 'quotation' in data ? data.quotation : data;
  if (!quotation) throw new Error('Quotation was not returned.');
  return quotation as Quotation;
}

export async function acceptQuotation(
  quotationId: string,
  input: Record<string, unknown> = {},
): Promise<{ quotation?: Quotation; tradeOrder?: Order; reused?: boolean; message?: string }> {
  return respondToQuotation(quotationId, 'accept', input);
}

export async function respondToQuotation(
  quotationId: string,
  action: 'accept' | 'reject',
  input: Record<string, unknown> = {},
): Promise<{ quotation?: Quotation; tradeOrder?: Order; reused?: boolean; message?: string }> {
  const payload = await apiRequest(`/quotations/${quotationId}`, {
    method: 'PUT',
    body: { action, ...input },
  });
  return unwrapData(payload);
}

export async function patchQuotation(
  quotationId: string,
  input: Record<string, unknown>,
): Promise<Quotation> {
  const payload = await apiRequest(`/quotations/${quotationId}`, {
    method: 'PATCH',
    body: input,
  });
  const data = unwrapData<{ quotation?: Quotation } | Quotation>(payload);
  return (
    data && typeof data === 'object' && 'quotation' in data ? data.quotation : data
  ) as Quotation;
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export async function fetchChats(
  input:
    | string
    | null
    | {
        role?: string | null;
        view?: 'all' | 'favorites' | 'archived';
        unreadOnly?: boolean;
        label?: string;
        limit?: number;
      } = {},
) {
  const params = typeof input === 'string' || input === null ? { role: input } : input;
  const payload = await apiRequest('/chat', {
    query: {
      role: params.role ?? undefined,
      view: params.view && params.view !== 'all' ? params.view : undefined,
      unreadOnly: params.unreadOnly,
      label: params.label,
      limit: params.limit ?? 80,
    },
  });
  return normalizeList<Chat>(payload, ['chats', 'conversations', 'items']);
}

export async function fetchChatDetails(
  chatId: string,
  options: {
    markRead?: boolean;
    before?: string;
    after?: string;
    limit?: number;
  } = {},
): Promise<ChatDetails> {
  const payload = await apiRequest(`/chat/${chatId}`, {
    query: {
      limit: options.limit ?? 30,
      markRead: options.markRead,
      before: options.before,
      after: options.after,
    },
  });
  return unwrapData<ChatDetails>(payload);
}

export async function sendChatMessage(
  chatId: string,
  content: string | Record<string, unknown>,
): Promise<MessageItem> {
  const payload = await apiRequest(`/chat/${chatId}`, {
    method: 'POST',
    body: typeof content === 'string' ? { content } : content,
  });
  const data = unwrapData<{ message?: MessageItem } | MessageItem>(payload);
  const message =
    data && typeof data === 'object' && 'message' in data ? data.message : data;
  if (!message) throw new Error('Message was not returned by the backend.');
  return message as MessageItem;
}

export async function uploadChatAttachment(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<UploadAttachment> {
  const form = new FormData();
  form.append('file', file as unknown as Blob);
  const payload = await apiRequest('/upload', { method: 'POST', body: form });
  const data = unwrapData<{ attachment?: UploadAttachment }>(payload);
  if (!data?.attachment) throw new Error('Upload attachment was not returned.');
  return data.attachment;
}

export async function enableChatOrder(chatId: string, productId: string) {
  const payload = await apiRequest(`/chat/${chatId}`, {
    method: 'PATCH',
    body: { action: 'enable_order', productId },
  });
  const data = unwrapData<{ chat?: Chat; message?: MessageItem }>(payload);
  if (!data?.chat) throw new Error('Start Order was not enabled.');
  return data;
}

export async function patchChatAction(
  chatId: string,
  input: {
    action: string;
    value?: boolean;
    label?: string;
    productId?: string;
  },
) {
  const payload = await apiRequest(`/chat/${chatId}`, { method: 'PATCH', body: input });
  return unwrapData<{ chat?: Chat; message?: MessageItem }>(payload);
}

export async function archiveChat(chatId: string, archived: boolean) {
  return patchChatAction(chatId, { action: 'archive', value: archived });
}

export async function favoriteChat(chatId: string, favorite: boolean) {
  return patchChatAction(chatId, { action: 'favorite', value: favorite });
}

export async function pinChat(chatId: string, pinned: boolean) {
  return patchChatAction(chatId, { action: 'pin', value: pinned });
}

export async function muteChat(chatId: string, muted: boolean) {
  return patchChatAction(chatId, { action: 'mute', value: muted });
}

export async function blockChatUser(chatId: string, blocked: boolean) {
  return patchChatAction(chatId, { action: 'block', value: blocked });
}

export type MessengerContact = { chatId: string; userId: string; name: string; email?: string; avatarUrl?: string; profileUrl?: string; type?: 'buyer' | 'seller'; isBlocked?: boolean; blockedAt?: string };
export async function fetchMessengerContacts(role?: string | null) {
  const payload = await apiRequest('/messenger/contacts', { query: { role: role ?? undefined } });
  return unwrapData<{ blockedUsers?: MessengerContact[]; recentContacts?: MessengerContact[] }>(payload);
}

export async function deleteChatForMe(chatId: string) {
  return patchChatAction(chatId, { action: 'delete' });
}

export async function markChatRead(chatId: string) {
  return patchChatAction(chatId, { action: 'mark_read' });
}

export async function markChatUnread(chatId: string) {
  return patchChatAction(chatId, { action: 'mark_unread' });
}

export async function createGroupChat(input: {
  groupName: string;
  memberIds: string[];
  role?: string | null;
}) {
  const payload = await apiRequest('/chat/groups', { method: 'POST', body: input });
  return unwrapData<{ chat?: Chat; created?: boolean }>(payload);
}

// ─── Orders ─────────────────────────────────────────────────────────────────

export async function calculateCheckoutQuote(
  input: Record<string, unknown>,
): Promise<CheckoutQuote> {
  const payload = await apiRequest('/checkout/quote', { method: 'POST', body: input });
  return unwrapData<CheckoutQuote>(payload);
}

export async function createSampleOrder(input: Record<string, unknown>): Promise<Order> {
  const payload = await apiRequest('/sample-order', { method: 'POST', body: input });
  const data = unwrapData<{ order?: Order } | Order>(payload);
  const order = data && typeof data === 'object' && 'order' in data ? data.order : data;
  if (!order) throw new Error('Sample order was not returned.');
  return order as Order;
}

export async function createTradeOrder(input: Record<string, unknown>): Promise<Order> {
  const payload = await apiRequest('/orders', { method: 'POST', body: input });
  const data = unwrapData<{ order?: Order } | Order>(payload);
  const order = data && typeof data === 'object' && 'order' in data ? data.order : data;
  if (!order) throw new Error('Trade order was not returned.');
  return order as Order;
}

export async function fetchOrderDetails(orderId: string): Promise<Order> {
  const payload = await apiRequest(`/orders/${orderId}`);
  const data = unwrapData<{ order?: Order } | Order>(payload);
  const order = data && typeof data === 'object' && 'order' in data ? data.order : data;
  if (!order) throw new Error('Order details were not returned.');
  return order as Order;
}

export async function updateOrderStatus(
  orderId: string,
  input: Record<string, unknown>,
): Promise<Order> {
  const payload = await apiRequest(`/orders/${orderId}`, { method: 'PATCH', body: input });
  const data = unwrapData<{ order?: Order } | Order>(payload);
  return (
    data && typeof data === 'object' && 'order' in data ? data.order : data
  ) as Order;
}

export async function fetchOrders(
  params: {
    type?: 'buyer' | 'seller';
    status?: string;
    orderType?: string;
    q?: string;
  } = {},
) {
  const payload = await apiRequest('/orders', {
    query: { ...params, limit: 80 },
  });
  return normalizeList<Order>(payload, ['orders', 'items', 'results']);
}

// ─── Payments ───────────────────────────────────────────────────────────────

export async function initiateOrderPayment(orderId: string): Promise<PaymentInitiation> {
  const payload = await apiRequest('/payments/initiate', {
    method: 'POST',
    body: { orderId },
  });
  return unwrapData<PaymentInitiation>(payload);
}

export async function fetchPaymentDetails(paymentId: string): Promise<Record<string, unknown>> {
  const payload = await apiRequest(`/payments/${paymentId}`);
  return unwrapData<Record<string, unknown>>(payload);
}

export async function fetchInvoices(): Promise<Record<string, unknown>[]> {
  const payload = await apiRequest('/invoices');
  const data = unwrapData<{ invoices?: Record<string, unknown>[] } | Record<string, unknown>[]>(payload);
  return Array.isArray(data) ? data : data?.invoices ?? [];
}

export async function verifyOrderPayment(
  input: Record<string, unknown>,
): Promise<{
  paymentRecord?: unknown;
  order?: Order;
  success?: boolean;
}> {
  const payload = await apiRequest('/payments/verify/order', {
    method: 'POST',
    body: input,
  });
  return unwrapData(payload);
}

// ─── Notifications ──────────────────────────────────────────────────────────

export async function fetchNotifications() {
  const payload = await apiRequest('/notifications');
  return normalizeList<NotificationItem>(payload, ['notifications', 'items']);
}

// ─── Upload Attachment for Enquiry ──────────────────────────────────────────

export async function uploadEnquiryAttachment(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<EnquiryAttachment> {
  const form = new FormData();
  form.append('file', file as unknown as Blob);
  const payload = await apiRequest('/upload', { method: 'POST', body: form });
  const data = unwrapData<{ url?: string; filename?: string }>(payload);
  return {
    url: data?.url ?? '',
    filename: data?.filename ?? file.name,
    type: file.type,
  };
}

// ─── Check Direct Order Eligibility ─────────────────────────────────────────

export async function checkDirectOrderEligibility(productId: string): Promise<{
  canStartOrder: boolean;
  reason?: string;
}> {
  const payload = await apiRequest(`/products/${productId}/eligibility`);
  const data = unwrapData<{ canStartOrder: boolean; reason?: string }>(payload);
  return {
    canStartOrder: data?.canStartOrder ?? false,
    reason: data?.reason,
  };
}

// ─── Check Existing Enquiry (Duplicate Prevention) ─────────────────────────

export async function checkExistingEnquiry(params: {
  productId: string;
  sellerUserId: string;
}): Promise<{ exists: boolean; rfqId?: string; chatId?: string }> {
  const payload = await apiRequest('/rfqs/check', { query: params });
  return unwrapData<{ exists: boolean; rfqId?: string; chatId?: string }>(payload);
}
