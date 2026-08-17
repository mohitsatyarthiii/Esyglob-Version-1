import { apiRequest, unwrapData } from './client'

export function normalizeUser(payload) {
  const data = unwrapData(payload)
  const user = data?.user || payload?.user || data
  if (!user || typeof user !== 'object') return null
  return {
    ...user,
    id: String(user.id || user._id || user.userId || ''),
    name: user.name || user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
    roles: Array.isArray(user.roles) ? user.roles : [user.primaryRole || 'buyer'],
  }
}

export async function getCurrentUser() {
  // A 401 is the normal guest-state response on first load. AuthProvider maps
  // it to `guest`, so it must not surface as a global "session expired" toast.
  return normalizeUser(await apiRequest('/auth/me', { cache: false, toastErrors: false }))
}

export async function login(credentials) {
  return normalizeUser(await apiRequest('/auth/signin', { method: 'POST', body: credentials }))
}

export async function signup(input) {
  const [firstName, ...lastName] = input.name.trim().split(/\s+/)
  return normalizeUser(await apiRequest('/auth/signup', {
    method: 'POST',
    body: { firstName, lastName: lastName.join(' '), email: input.email, password: input.password, role: input.role, roles: [input.role] },
  }))
}

export function logout() {
  return apiRequest('/auth/logout', { method: 'POST' })
}

export function requestPasswordReset(email, challengeId) {
  return apiRequest(challengeId ? '/auth/forgot-password/resend' : '/auth/forgot-password', {
    method: 'POST',
    body: { email, ...(challengeId ? { challengeId } : {}) },
  })
}

export function verifyPasswordResetOtp(challengeId, otp) {
  return apiRequest('/auth/forgot-password/verify', { method: 'POST', body: { challengeId, otp } })
}

export function resetPassword(challengeId, resetToken, password, confirmPassword) {
  return apiRequest('/auth/reset-password', {
    method: 'POST',
    body: { challengeId, resetToken, password, confirmPassword },
  })
}
