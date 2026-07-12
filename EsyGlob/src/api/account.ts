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
  address?: string;
  businessType?: string;
  companyDescription?: string;
  roles?: string[];
  primaryRole?: string;
  preferredCurrency?: string;
};

export type WalletData = {
  wallet?: Record<string, unknown>;
  summary?: Record<string, number>;
  transactions?: Array<Record<string, unknown>>;
  withdrawals?: Array<Record<string, unknown>>;
  paymentMethods?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  orders?: Array<Record<string, unknown>>;
};

export type AddressBookItem = {
  _id?: string;
  id?: string;
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  postalCode?: string;
  addressType?: string;
  isDefault?: boolean;
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

export interface UserLocation {
  _id: string;
  userId: string;
  current: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  address?: LocationAddress;
  lastUpdated: string;
  isActive: boolean;
  history: Array<{
    location: {
      type: 'Point';
      coordinates: [number, number];
    };
    accuracy?: number;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface LocationResponse {
  location: UserLocation | null;
  message?: string;
}

export interface LocationHistoryResponse {
  history: Array<{
    location: {
      type: 'Point';
      coordinates: [number, number];
    };
    accuracy?: number;
    timestamp: string;
  }>;
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

export async function createAddress(input: AddressBookItem) {
  const payload = await apiRequest('/addresses', { method: 'POST', body: input });
  return unwrapData(payload);
}

export async function updateAddress(addressId: string, input: AddressBookItem) {
  const payload = await apiRequest(`/addresses/${addressId}`, { method: 'PUT', body: input });
  return unwrapData(payload);
}

export async function setDefaultAddress(addressId: string) {
  const payload = await apiRequest(`/addresses/${addressId}`, { method: 'PATCH' });
  return unwrapData(payload);
}

export async function deleteAddress(addressId: string) {
  const payload = await apiRequest(`/addresses/${addressId}`, { method: 'DELETE' });
  return unwrapData(payload);
}

// ─── Location APIs ─────────────────────────────────────────────────────

/**
 * Get current user location
 */
export async function getCurrentLocation() {
  const payload = await apiRequest('/location');
  return unwrapData<LocationResponse>(payload);
}

/**
 * Update current location (GPS tracking)
 */
export async function updateCurrentLocation(data: UpdateLocationPayload) {
  const payload = await apiRequest('/location', { method: 'PUT', body: data });
  return unwrapData<LocationResponse>(payload);
}

/**
 * Update address from reverse geocoding
 */
export async function updateLocationAddress(data: LocationAddress) {
  const payload = await apiRequest('/location/address', { method: 'PATCH', body: data });
  return unwrapData<LocationResponse>(payload);
}

/**
 * Get location history with optional date range
 */
export async function getLocationHistory(startDate?: string, endDate?: string) {
  const payload = await apiRequest('/location/history', {
    query: {
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
    },
  });
  return unwrapData<LocationHistoryResponse>(payload);
}

/**
 * Toggle location tracking on/off
 */
export async function toggleLocationTracking(isActive: boolean) {
  const payload = await apiRequest('/location/toggle', { method: 'PUT', body: { isActive } });
  return unwrapData<LocationResponse>(payload);
}

/**
 * Delete location data permanently
 */
export async function deleteLocationData() {
  const payload = await apiRequest('/location', { method: 'DELETE' });
  return unwrapData<{ success: boolean }>(payload);
}
