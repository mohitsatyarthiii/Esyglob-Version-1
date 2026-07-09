import { apiRequest, clearAuthTokens, clearSessionCookie } from './client';
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

export type ForgotPasswordInput = {   };

export async function getCurrentUser() {
  const payload = await apiRequest('/auth/me');
  return normalizeUser(payload) as CurrentUser;
}

export async function login(input: LoginInput) {
  const payload = await apiRequest('/auth/signin', {
    method: 'POST',
    body: input,
  });

  return normalizeUser(payload) as CurrentUser;
}

export async function signup(input: SignupInput) {
  const [firstName, ...lastNameParts] = input.name.trim().split(/\s+/);
  const payload = await apiRequest('/auth/signup', {
    method: 'POST',
    body: {
      ...input,
      fullName: input.name,
      firstName,
      lastName: lastNameParts.join(' '),
      roles: [input.role],
    },
  });

  return normalizeUser(payload) as CurrentUser;
}

export async function logout() {
  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
    });
  } finally {
    clearSessionCookie();
    clearAuthTokens();
  }
}

export async function forgotPassword(input: ForgotPasswordInput) {
  return apiRequest('/auth/forgot-password', {
    method: 'POST',
    body: input,
  });
}
