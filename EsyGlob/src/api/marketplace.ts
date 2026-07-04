import { apiRequest } from './client';
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
  SellerDetails,
  SellerSummary,
} from './types';
export { fetchCategories, fetchCategoryDetails } from './categories';
export { fetchHome } from './home';
export { fetchProducts, fetchProductDetails } from './products';
export { searchMarketplace } from './search';

export async function fetchRFQs() {
  const payload = await apiRequest('/api/rfqs');
  return normalizeList<RFQ>(payload, ['rfqs', 'items', 'results']);
}

export async function fetchRFQDetails(rfqId: string): Promise<RFQDetails> {
  const payload = await apiRequest(`/api/rfqs/${rfqId}`);
  return unwrapData<RFQDetails>(payload);
}

export async function fetchSellers(params: {
  q?: string;
  search?: string;
  page?: number;
  limit?: number;
  isVerified?: boolean;
  sort?: string;
} = {}) {
  const payload = await apiRequest('/api/sellers', { query: params });
  const data = unwrapData<{ sellers?: SellerSummary[]; pagination?: unknown }>(payload);

  return {
    sellers: data?.sellers ?? normalizeList<SellerSummary>(payload, ['sellers']),
    pagination: data?.pagination,
  };
}

export async function fetchSellerDetails(sellerId: string): Promise<SellerDetails> {
  const payload = await apiRequest(`/api/sellers/${sellerId}`);
  return unwrapData<SellerDetails>(payload);
}

export async function fetchSellerOnboarding(): Promise<{ seller?: SellerSummary; verification?: Record<string, unknown>; completion?: Record<string, unknown>; draftAvailable?: boolean }> {
  const payload = await apiRequest('/api/seller/onboarding');
  return unwrapData(payload);
}

export async function saveSellerOnboarding(input: Record<string, unknown>, draft = true) {
  const payload = await apiRequest('/api/seller/onboarding', {
    method: draft ? 'PATCH' : 'POST',
    body: input,
  });
  return unwrapData(payload);
}

export async function fetchFactoryProfile(): Promise<{ seller?: SellerSummary; factoryProfile?: Record<string, unknown> | null }> {
  const payload = await apiRequest('/api/seller/factory');
  return unwrapData(payload);
}

export async function saveFactoryProfile(input: Record<string, unknown>, draft = false) {
  const payload = await apiRequest('/api/seller/factory', {
    method: draft ? 'PATCH' : 'PUT',
    body: input,
  });
  return unwrapData(payload);
}

export async function uploadSellerDocument(documentType: string, file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  form.append('documentType', documentType);
  form.append('file', file as unknown as Blob);
  const payload = await apiRequest('/api/seller/verification/documents', {
    method: 'POST',
    body: form,
  });
  return unwrapData(payload);
}

export async function uploadFiles(folder: string, files: Array<{ uri: string; name: string; type: string }>): Promise<{ uploads?: UploadAttachment[] }> {
  const form = new FormData();
  form.append('folder', folder);
  files.forEach(file => form.append('files', file as unknown as Blob));
  const payload = await apiRequest('/api/uploads', {
    method: 'POST',
    body: form,
  });
  return unwrapData(payload);
}

export async function fetchSellerProducts(params: { q?: string; status?: string; page?: number; limit?: number } = {}) {
  const payload = await apiRequest('/api/seller/products', { query: { ...params, limit: params.limit ?? 30 } });
  const data = unwrapData<{ products?: Product[]; pagination?: unknown }>(payload);

  return {
    products: data?.products ?? normalizeList<Product>(payload, ['products']),
    pagination: data?.pagination,
  };
}

export async function fetchSellerProductDetails(productId: string): Promise<Product> {
  const payload = await apiRequest(`/api/seller/products/${productId}`);
  const data = unwrapData<{ product?: Product } | Product>(payload);
  const product = data && typeof data === 'object' && 'product' in data ? data.product : data;

  if (!product) {
    throw new Error('Seller product details were not returned by the backend.');
  }

  return product as Product;
}

export async function createSellerProduct(input: Record<string, unknown>): Promise<{ product?: Product; visibilityNotice?: string }> {
  const payload = await apiRequest('/api/products', { method: 'POST', body: input });
  return unwrapData(payload);
}

export async function updateSellerProduct(productId: string, input: Record<string, unknown>): Promise<{ product?: Product; visibilityNotice?: string }> {
  const payload = await apiRequest(`/api/products/${productId}`, { method: 'PATCH', body: input });
  return unwrapData(payload);
}

export async function deleteSellerProduct(productId: string) {
  const payload = await apiRequest(`/api/products/${productId}`, { method: 'DELETE' });
  return unwrapData(payload);
}

export async function fetchQuotations(params: { rfqId?: string; status?: string; page?: number; limit?: number } = {}): Promise<QuotationListResponse> {
  const payload = await apiRequest('/api/quotations', { query: params });
  const data = unwrapData<QuotationListResponse | Quotation[]>(payload);

  return {
    quotations: Array.isArray(data) ? data : data?.quotations ?? normalizeList<Quotation>(payload, ['quotations']),
    pagination: Array.isArray(data) ? undefined : data?.pagination,
  };
}

export async function fetchQuotationDetails(quotationId: string): Promise<Quotation> {
  const payload = await apiRequest(`/api/quotations/${quotationId}`);
  const data = unwrapData<{ quotation?: Quotation } | Quotation>(payload);
  const quotation = data && typeof data === 'object' && 'quotation' in data ? data.quotation : data;

  if (!quotation) {
    throw new Error('Quotation details were not returned by the backend.');
  }

  return quotation as Quotation;
}

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
  attachments?: string[];
};

export async function startProductChat(input: { otherUserId: string; productId: string; role?: 'buyer' | 'seller'; enquiry?: boolean }) {
  const payload = await apiRequest('/api/chats', {
    method: 'POST',
    body: {
      role: 'buyer',
      enquiry: false,
      ...input,
    },
  });
  const data = unwrapData<{ chat?: Chat; created?: boolean }>(payload);

  if (!data?.chat) {
    throw new Error('Conversation was not returned by the backend.');
  }

  return data;
}

export async function createProductEnquiry(input: EnquiryInput) {
  const payload = await apiRequest('/api/rfqs/enquiry', {
    method: 'POST',
    body: {
      attachments: [],
      ...input,
    },
  });
  const data = unwrapData<{ rfq?: RFQ; chat?: Chat; message?: string }>(payload);

  if (!data?.rfq || !data?.chat) {
    throw new Error('Enquiry response did not include both RFQ and conversation.');
  }

  return data;
}

export async function createRFQ(input: Record<string, unknown>): Promise<RFQ> {
  const payload = await apiRequest('/api/rfqs', {
    method: 'POST',
    body: input,
  });
  const data = unwrapData<{ rfq?: RFQ } | RFQ>(payload);
  const rfq = data && typeof data === 'object' && 'rfq' in data ? data.rfq : data;

  if (!rfq) {
    throw new Error('RFQ was not returned by the backend.');
  }

  return rfq as RFQ;
}

export async function fetchChats(role?: string | null) {
  const payload = await apiRequest('/api/chats', { query: { role: role ?? undefined, limit: 80 } });
  return normalizeList<Chat>(payload, ['chats', 'conversations', 'items']);
}

export async function fetchChatDetails(chatId: string, options: { markRead?: boolean } = {}): Promise<ChatDetails> {
  const payload = await apiRequest(`/api/chats/${chatId}`, { query: { limit: 30, markRead: options.markRead } });
  return unwrapData<ChatDetails>(payload);
}

export async function sendChatMessage(chatId: string, content: string | Record<string, unknown>): Promise<MessageItem> {
  const payload = await apiRequest(`/api/chats/${chatId}`, {
    method: 'POST',
    body: typeof content === 'string' ? { content } : content,
  });
  const data = unwrapData<{ message?: MessageItem } | MessageItem>(payload);
  const message = data && typeof data === 'object' && 'message' in data ? data.message : data;

  if (!message) {
    throw new Error('Message was not returned by the backend.');
  }

  return message as MessageItem;
}

export type UploadAttachment = {
  id?: string;
  url?: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

export async function uploadChatAttachment(file: { uri: string; name: string; type: string }): Promise<UploadAttachment> {
  const form = new FormData();
  form.append('file', file as unknown as Blob);
  const payload = await apiRequest('/api/uploads/chat', {
    method: 'POST',
    body: form,
  });
  const data = unwrapData<{ attachment?: UploadAttachment }>(payload);

  if (!data?.attachment) {
    throw new Error('Upload attachment was not returned by the backend.');
  }

  return data.attachment;
}

export async function enableChatOrder(chatId: string, productId: string) {
  const payload = await apiRequest(`/api/chats/${chatId}`, {
    method: 'PATCH',
    body: { action: 'enable_order', productId },
  });
  const data = unwrapData<{ chat?: Chat; message?: MessageItem }>(payload);

  if (!data?.chat) {
    throw new Error('Start Order was not enabled by the backend.');
  }

  return data;
}

export async function patchChatAction(chatId: string, input: { action: string; value?: boolean; label?: string; productId?: string }) {
  const payload = await apiRequest(`/api/chats/${chatId}`, {
    method: 'PATCH',
    body: input,
  });
  return unwrapData<{ chat?: Chat; message?: MessageItem }>(payload);
}

export async function createGroupChat(input: { groupName: string; memberIds: string[]; role?: string | null }) {
  const payload = await apiRequest('/api/chats/groups', {
    method: 'POST',
    body: input,
  });
  return unwrapData<{ chat?: Chat; created?: boolean }>(payload);
}

export async function createQuotation(input: Record<string, unknown>): Promise<Quotation> {
  const payload = await apiRequest('/api/quotations', {
    method: 'POST',
    body: input,
  });
  const data = unwrapData<{ quotation?: Quotation } | Quotation>(payload);
  const quotation = data && typeof data === 'object' && 'quotation' in data ? data.quotation : data;

  if (!quotation) {
    throw new Error('Quotation was not returned by the backend.');
  }

  return quotation as Quotation;
}

export async function calculateCheckoutQuote(input: Record<string, unknown>): Promise<CheckoutQuote> {
  const payload = await apiRequest('/api/checkout/quote', {
    method: 'POST',
    body: input,
  });
  return unwrapData<CheckoutQuote>(payload);
}

export async function createSampleOrder(input: Record<string, unknown>): Promise<Order> {
  const payload = await apiRequest('/api/sample-order', {
    method: 'POST',
    body: input,
  });
  const data = unwrapData<{ order?: Order } | Order>(payload);
  const order = data && typeof data === 'object' && 'order' in data ? data.order : data;

  if (!order) {
    throw new Error('Sample order was not returned by the backend.');
  }

  return order as Order;
}

export async function createTradeOrder(input: Record<string, unknown>): Promise<Order> {
  const payload = await apiRequest('/api/orders', {
    method: 'POST',
    body: input,
  });
  const data = unwrapData<{ order?: Order } | Order>(payload);
  const order = data && typeof data === 'object' && 'order' in data ? data.order : data;

  if (!order) {
    throw new Error('Trade order was not returned by the backend.');
  }

  return order as Order;
}

export async function fetchOrderDetails(orderId: string): Promise<Order> {
  const payload = await apiRequest(`/api/orders/${orderId}`);
  const data = unwrapData<{ order?: Order } | Order>(payload);
  const order = data && typeof data === 'object' && 'order' in data ? data.order : data;

  if (!order) {
    throw new Error('Order details were not returned by the backend.');
  }

  return order as Order;
}

export async function updateOrderStatus(orderId: string, input: Record<string, unknown>): Promise<Order> {
  const payload = await apiRequest(`/api/orders/${orderId}`, {
    method: 'PATCH',
    body: input,
  });
  const data = unwrapData<{ order?: Order } | Order>(payload);
  return (data && typeof data === 'object' && 'order' in data ? data.order : data) as Order;
}

export async function fetchOrders(params: { type?: 'buyer' | 'seller'; status?: string; orderType?: string; q?: string } = {}) {
  const payload = await apiRequest('/api/orders', { query: { ...params, limit: 80 } });
  return normalizeList<Order>(payload, ['orders', 'items', 'results']);
}

export async function initiateOrderPayment(orderId: string): Promise<PaymentInitiation> {
  const payload = await apiRequest('/api/payments/initiate', {
    method: 'POST',
    body: { orderId },
  });
  return unwrapData<PaymentInitiation>(payload);
}

export async function verifyOrderPayment(input: Record<string, unknown>): Promise<{ paymentRecord?: unknown; order?: Order; success?: boolean }> {
  const payload = await apiRequest('/api/payments/verify-order', {
    method: 'POST',
    body: input,
  });
  return unwrapData<{ paymentRecord?: unknown; payment?: unknown; order?: Order; success?: boolean }>(payload);
}

export async function acceptQuotation(quotationId: string, input: Record<string, unknown> = {}): Promise<Quotation> {
  const payload = await apiRequest(`/api/quotations/${quotationId}`, {
    method: 'PUT',
    body: { action: 'accept', ...input },
  });
  const data = unwrapData<{ quotation?: Quotation } | Quotation>(payload);
  return (data && typeof data === 'object' && 'quotation' in data ? data.quotation : data) as Quotation;
}

export async function patchQuotation(quotationId: string, input: Record<string, unknown>): Promise<Quotation> {
  const payload = await apiRequest(`/api/quotations/${quotationId}`, {
    method: 'PATCH',
    body: input,
  });
  const data = unwrapData<{ quotation?: Quotation } | Quotation>(payload);
  return (data && typeof data === 'object' && 'quotation' in data ? data.quotation : data) as Quotation;
}

export async function fetchNotifications() {
  const payload = await apiRequest('/api/notifications');
  return normalizeList<NotificationItem>(payload, ['notifications', 'items']);
}
