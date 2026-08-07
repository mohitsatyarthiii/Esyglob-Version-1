import { apiRequest, unwrapData } from './client'

export const fetchVerificationWorkspace = () => apiRequest('/suppliers/onboarding', { cache: false }).then(unwrapData)
export const saveVerificationDraft = (body) => apiRequest('/suppliers/onboarding', { method: 'PATCH', body }).then(unwrapData)
export const fetchFactoryProfile = () => apiRequest('/suppliers/factory-profile', { cache: false }).then(unwrapData)
export const saveFactoryProfile = (body) => apiRequest('/suppliers/factory-profile', { method: 'PATCH', body }).then(unwrapData)
export const archiveVerificationDocument = (id) => apiRequest(`/suppliers/verification/documents/${id}`, { method: 'DELETE' })
export async function uploadVerificationDocument(type, file) {
  const body = new FormData(); body.append('documentType', type); body.append('file', file)
  return apiRequest('/suppliers/verification/documents', { method: 'POST', body }).then(unwrapData)
}
export const fetchVerificationReviews = (query = {}) => apiRequest('/suppliers/verification/admin/reviews', { query, cache: false }).then(unwrapData)
export const reviewVerification = (id, body) => apiRequest(`/suppliers/verification/admin/reviews/${id}`, { method: 'PATCH', body }).then(unwrapData)
export const reviewVerificationDocument = (id, body) => apiRequest(`/suppliers/verification/admin/documents/${id}`, { method: 'PATCH', body }).then(unwrapData)

export const fetchSubscription = (role = 'seller') => apiRequest('/subscription', { query: { role }, cache: false }).then(unwrapData)
export const fetchSubscriptionPlans = (role = 'seller') => apiRequest('/subscription/plans', { query: { role } }).then(unwrapData)
export const createSubscriptionOrder = (body) => apiRequest('/subscription/create-order', { method: 'POST', body }).then(unwrapData)
export const changeSubscriptionPlan = (body) => apiRequest('/subscription/change-plan', { method: 'POST', body }).then(unwrapData)
export const verifySubscriptionPayment = (body) => apiRequest('/payments/verify/subscription', { method: 'POST', body }).then(unwrapData)
export const setSubscriptionAutoRenew = (autoRenew) => apiRequest('/subscription/auto-renew', { method: 'PATCH', body: { autoRenew } }).then(unwrapData)
