import { apiRequest } from './client';
import { unwrapData } from './normalizers';

export type SupportTicket = { _id: string; subject: string; description: string; issueType: string; status: 'open'|'triaged'|'in_progress'|'resolved'|'closed'; priority: string; createdAt?: string; updatedAt?: string };
export async function createSupportTicket(input: { subject: string; description: string; roleContext: 'buyer'|'seller'; issueType?: string; priority?: string; metadata?: Record<string,unknown> }) {
  return unwrapData<{ticket:SupportTicket}>(await apiRequest('/support-tickets',{method:'POST',body:input}));
}
export async function fetchSupportTickets() {
  const result=unwrapData<{tickets:SupportTicket[]}>(await apiRequest('/support-tickets',{query:{limit:20}}));
  return result.tickets ?? [];
}

export async function submitSupportContact(input: { name: string; email: string; subject: string; message: string }) {
  return unwrapData(await apiRequest('/contact', { method: 'POST', body: { ...input, consent: true } }));
}
