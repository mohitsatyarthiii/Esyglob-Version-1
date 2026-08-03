import { apiRequest } from './client';
import { normalizeList, unwrapData } from './normalizers';
import { NotificationItem, SavedItem, SavedItemType } from './types';

// ─── Types ──────────────────────────────────────────────────────────────

export type ProfileSettings = {
  fullName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  country?: string;
  city?: string;
  district?: string;
  address?: string;
  businessType?: string;
  companyDescription?: string;
  roles?: string[];
  primaryRole?: string;
  preferredCurrency?: string;
};

export type WalletData = {
  wallet?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  transactions?: Array<Record<string, unknown>>;
  withdrawals?: Array<Record<string, unknown>>;
  paymentMethods?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
  escrowTransactions?: Array<Record<string, unknown>>;
};

export type WalletActivitySource = 'transaction' | 'withdrawal' | 'payment';

export type WalletActivityDetails = {
  activity: Record<string, unknown>;
  order?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  wallet?: Record<string, unknown>;
};

export type AddressBookItem = {
  _id?: string;
  id?: string;
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  street?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  pincode?: string;
  postalCode?: string;
  addressType?: string;
  addressLabel?: 'Home' | 'Office' | 'Warehouse' | 'Other';
  isDefault?: boolean;
  countryCode?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
};

export type StandardizedLocation = {
  placeId?: string;
  formattedAddress: string;
  line1?: string;
  city?: string;
  district?: string;
  street?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
};

export type AddressSuggestion = {
  placeId: string;
  label: string;
  primaryText: string;
  secondaryText?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  postalCode?: string;
};

// ─── Location Types ────────────────────────────────────────────────────



interface LocationAddress {
  formatted?: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
}
export interface UpdateLocationPayload extends LocationCoordinates {
  address?: LocationAddress;
}


// ─── Profile APIs ──────────────────────────────────────────────────────

export async function fetchProfileSettings() {
  const payload = await apiRequest('/profile');
  const data = unwrapData<{ profile?: ProfileSettings }>(payload);
  return data.profile ?? {};
}

export async function updateProfileSettings(input: ProfileSettings) {
  const payload = await apiRequest('/profile', { method: 'PATCH', body: input });
  return unwrapData(payload);
}

export async function updatePreferredCurrency(currency: string) {
  const payload = await apiRequest('/profile/currency', { method: 'PATCH', body: { currency } });
  return unwrapData(payload);
}

export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  const payload = await apiRequest('/profile/password', { method: 'PATCH', body: input });
  return unwrapData(payload);
}

// ─── Wallet APIs ───────────────────────────────────────────────────────

export async function fetchWallet(role: string) {
  const payload = await apiRequest('/wallet', { query: { role } });
  return unwrapData<WalletData>(payload);
}

export async function fetchWalletActivityDetails(
  role: string,
  source: WalletActivitySource,
  activityId: string,
): Promise<WalletActivityDetails> {
  const data = await fetchWallet(role);
  const records = source === 'transaction'
    ? data.transactions
    : source === 'withdrawal'
      ? data.withdrawals
      : data.payments;
  const activity = (records ?? []).find(item => String(item._id ?? item.id) === activityId);
  if (!activity) throw new Error('This wallet activity could not be found. Pull to refresh and try again.');

  const orderId = typeof activity.orderId === 'object'
    ? String((activity.orderId as Record<string, unknown>)._id ?? '')
    : String(activity.orderId ?? '');
  const paymentId = source === 'payment'
    ? activityId
    : typeof activity.paymentId === 'object'
      ? String((activity.paymentId as Record<string, unknown>)._id ?? '')
      : String(activity.paymentId ?? '');
  return {
    activity,
    order: (data.orders ?? []).find(item => String(item._id ?? item.id) === orderId),
    payment: (data.payments ?? []).find(item => String(item._id ?? item.id) === paymentId),
    wallet: data.wallet,
  };
}

export async function fetchPaymentMethods(role: string) {
  const payload = await apiRequest('/wallet/payment-methods', { query: { role } });
  return normalizeList<Record<string, unknown>>(payload, ['paymentMethods', 'items']);
}

export async function addPaymentMethod(input: Record<string, unknown>) {
  const payload = await apiRequest('/wallet/payment-methods', { method: 'POST', body: input });
  return unwrapData(payload);
}

export async function fetchWithdrawals() {
  const payload = await apiRequest('/wallet/withdrawals');
  return normalizeList<Record<string, unknown>>(payload, ['withdrawals', 'items']);
}

export async function requestWithdrawal(input: Record<string, unknown>) {
  const payload = await apiRequest('/wallet/withdrawals', { method: 'POST', body: input });
  return unwrapData(payload);
}

// ─── Notification APIs ─────────────────────────────────────────────────

export async function fetchNotificationCenter() {
  const payload = await apiRequest('/notifications', { query: { limit: 30 } });
  const data = unwrapData<{ notifications?: NotificationItem[]; items?: NotificationItem[]; unreadCount?: number; pagination?: Record<string, unknown> }>(payload);
  return {
    notifications: data.notifications ?? data.items ?? normalizeList<NotificationItem>(payload, ['notifications', 'items']),
    unreadCount: data.unreadCount,
    pagination: data.pagination,
  };
}

export async function markAllNotificationsRead() {
  const payload = await apiRequest('/notifications/bulk', {
    method: 'PATCH',
    body: { action: 'mark_all_read' },
  });
  return unwrapData(payload);
}

export async function markNotificationRead(notificationId: string) {
  const payload = await apiRequest(`/notifications/${notificationId}`, { method: 'PATCH' });
  return unwrapData(payload);
}

export async function deleteNotification(notificationId: string) {
  const payload = await apiRequest(`/notifications/${notificationId}`, { method: 'DELETE' });
  return unwrapData(payload);
}

export async function clearReadNotifications() {
  const payload = await apiRequest('/notifications/bulk', { method: 'DELETE', query: { scope: 'read' } });
  return unwrapData(payload);
}

// ─── Saved Items APIs ──────────────────────────────────────────────────

export async function fetchSavedItems(input: { type?: SavedItemType; itemId?: string; limit?: number } = {}) {
  const payload = await apiRequest('/buyer/saved', {
    query: {
      type: input.type,
      itemId: input.itemId,
      limit: input.limit ?? 100,
    },
  });
  return normalizeList<SavedItem>(payload, ['items', 'savedItems']);
}

export async function toggleSavedItem(input: { type: SavedItemType; itemId: string }) {
  const payload = await apiRequest('/buyer/saved', {
    method: 'POST',
    body: {
      itemType: input.type,
      itemId: input.itemId,
    },
  });
  return unwrapData<{ saved?: boolean; item?: SavedItem }>(payload);
}

// ─── Address APIs ──────────────────────────────────────────────────────

export async function fetchAddresses() {
  const payload = await apiRequest('/addresses');
  return normalizeList<AddressBookItem>(payload, ['addresses', 'items']);
}

export async function searchAddressSuggestions(input: string, sessionToken: string, countryCodes = '') {
  const payload = await apiRequest('/location/autocomplete/search', { query: { input, sessionToken, countryCodes } });
  return unwrapData<{ suggestions?: AddressSuggestion[] }>(payload).suggestions ?? [];
}

export async function resolveAddressSuggestion(placeId: string, sessionToken: string) {
  const payload = await apiRequest('/location/autocomplete/resolve', { query: { placeId, sessionToken } });
  return unwrapData<{ location?: StandardizedLocation }>(payload).location;
}

export async function reverseAddressCoordinates(latitude: number, longitude: number) {
  const payload = await apiRequest('/location/autocomplete/reverse', { query: { latitude, longitude } });
  return unwrapData<{ location?: StandardizedLocation }>(payload).location;
}

export async function createAddress(input: AddressBookItem) {
  const payload = await apiRequest('/addresses', { method: 'POST', body: normalizeAddressInput(input) });
  const data = unwrapData<{ address?: AddressBookItem } | AddressBookItem>(payload);
  return data && typeof data === 'object' && 'address' in data ? data.address! : data;
}

export async function updateAddress(addressId: string, input: AddressBookItem) {
  const payload = await apiRequest(`/addresses/${addressId}`, { method: 'PUT', body: normalizeAddressInput(input) });
  const data = unwrapData<{ address?: AddressBookItem } | AddressBookItem>(payload);
  return data && typeof data === 'object' && 'address' in data ? data.address! : data;
}

function normalizeAddressInput(input: AddressBookItem) {
  return {
    ...input,
    address: input.address || input.line1 || input.street || '',
    postalCode: input.postalCode || input.pincode || '',
  };
}

export async function setDefaultAddress(addressId: string) {
  const payload = await apiRequest(`/addresses/${addressId}`, { method: 'PATCH', body: { isDefault: true } });
  return unwrapData(payload);
}

export async function updateCurrentAddress(data: UpdateLocationPayload) {
  const payload = await apiRequest('/addresses/current', { method: 'PUT', body: data });
  return unwrapData<{ address?: AddressBookItem }>(payload);
}

export async function deleteAddress(addressId: string) {
  const payload = await apiRequest(`/addresses/${addressId}`, { method: 'DELETE' });
  return unwrapData(payload);
}

// ─── Location APIs ─────────────────────────────────────────────────────
