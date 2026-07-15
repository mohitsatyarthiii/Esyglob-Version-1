import { apiRequest, buildApiUrl } from './client';
import { normalizeList, unwrapData } from './normalizers';
export type UserDocument = {
  _id: string;
  name?: string;
  type: string;
  category?: string;
  fileUrl?: string;
  fileType?: string;
  status: string;
  rejectionReason?: string;
  reviewerNotes?: string;
  expiryDate?: string;
  createdAt?: string;
  updatedAt?: string;
};
export async function fetchDocuments() {
  return normalizeList<UserDocument>(await apiRequest('/documents'), [
    'documents',
  ]);
}
export async function saveDocument(input: Partial<UserDocument>, id?: string) {
  return unwrapData(
    await apiRequest(id ? `/documents/${id}` : '/documents', {
      method: id ? 'PATCH' : 'POST',
      body: input,
    }),
  );
}
export function documentUrl(url?: string) {
  return url?.startsWith('/') ? buildApiUrl(url) : url;
}
