import { apiRequest, clearAuthTokens, clearSessionCookie, setAuthTokens } from './client';
import { normalizeUser } from './normalizers';
import { CurrentUser, UserRole } from './types';

export type LoginInput = {
  email: string;
  password: string;
};

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  role: Exclude<UserRole, 'admin'>;
  companyName?: string;
  phone?: string;
};

export type ForgotPasswordInput = {
  email: string;
};

export async function getCurrentUser() {
  const payload = await apiRequest('/api/auth/me');
  return normalizeUser(payload) as CurrentUser;
}

export async function login(input: LoginInput) {
  const payload = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: input,
  });
  storeTokens(payload);

  return normalizeUser(payload) as CurrentUser;
}

export async function signup(input: SignupInput) {
  const [firstName, ...lastNameParts] = input.name.trim().split(/\s+/);
  const payload = await apiRequest('/api/auth/signup', {
    method: 'POST',
    body: {
      ...input,
      fullName: input.name,
      firstName,
      lastName: lastNameParts.join(' '),
    },
  });
  storeTokens(payload);

  return normalizeUser(payload) as CurrentUser;
}

export async function logout() {
  try {
    await apiRequest('/api/auth/logout', {
      method: 'POST',
    });
  } finally {
    clearSessionCookie();
    clearAuthTokens();
  }
}

export async function forgotPassword(input: ForgotPasswordInput) {
  return apiRequest('/api/auth/forgot-password', {
    method: 'POST',
    body: input,
  });
}

function storeTokens(payload: unknown) {
  const data =
    payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data?: unknown }).data
      : payload;

  if (!data || typeof data !== 'object') {
    return;
  }

  const accessToken = (data as { accessToken?: unknown }).accessToken;

  if (typeof accessToken === 'string') {
    setAuthTokens(accessToken);
  }
}
