import { apiRequest } from './client';
import { unwrapData } from './normalizers';

export async function submitSupportContact(input: { name: string; email: string; subject: string; message: string }) {
  return unwrapData(await apiRequest('/contact', { method: 'POST', body: { ...input, consent: true } }));
}
