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

export async function fetchChats(role?: string | null) {
  const payload = await apiRequest('/api/chats', { query: { role: role ?? undefined, limit: 80 } });
  return normalizeList<Chat>(payload, ['chats', 'conversations', 'items']);
}

export async function fetchChatDetails(chatId: string, options: { markRead?: boolean } = {}): Promise<ChatDetails> {
  const payload = await apiRequest(`/api/chats/${chatId}`, { query: { limit: 30, markRead: options.markRead } });
  return unwrapData<ChatDetails>(payload);
}

export async function sendChatMessage(chatId: string, content: string): Promise<MessageItem> {
  const payload = await apiRequest(`/api/chats/${chatId}`, {
    method: 'POST',
    body: { content },
  });
  const data = unwrapData<{ message?: MessageItem } | MessageItem>(payload);
  const message = data && typeof data === 'object' && 'message' in data ? data.message : data;

  if (!message) {
    throw new Error('Message was not returned by the backend.');
  }

  return message as MessageItem;
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

export async function initiateOrderPayment(orderId: string): Promise<PaymentInitiation> {
  const payload = await apiRequest('/api/payments/initiate', {
    method: 'POST',
    body: { orderId },
  });
  return unwrapData<PaymentInitiation>(payload);
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
