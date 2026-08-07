import { apiRequest, unwrapData } from './client'

const data = payload => unwrapData(payload) || {}

export async function fetchCoupons() { return data(await apiRequest('/promotions/coupons', { cache: false })) }
export async function createCoupon(input) { return data(await apiRequest('/promotions/coupons', { method: 'POST', body: input })) }
export async function updateCoupon(id, input) { return data(await apiRequest(`/promotions/coupons/${id}`, { method: 'PATCH', body: input })) }
export async function deleteCoupon(id) { return data(await apiRequest(`/promotions/coupons/${id}`, { method: 'DELETE' })) }
export async function fetchCouponAnalytics() { return data(await apiRequest('/promotions/coupons-analytics', { cache: false })) }
export async function fetchGiftCards(all = false) { return data(await apiRequest('/promotions/gift-cards', { query: { all }, cache: false })) }
export async function issueGiftCard(input) { return data(await apiRequest('/promotions/gift-cards', { method: 'POST', body: input })) }
export async function purchaseGiftCard(input) { return data(await apiRequest('/promotions/gift-cards/purchase', { method: 'POST', body: input })) }
export async function verifyGiftCardPurchase(input) { return data(await apiRequest('/promotions/gift-cards/verify-purchase', { method: 'POST', body: input })) }
