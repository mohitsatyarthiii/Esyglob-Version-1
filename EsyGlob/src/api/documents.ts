import { apiRequest, buildApiUrl } from './client';
import { normalizeList, unwrapData } from './normalizers';
export type UserDocument = {
  _id: string;
  name?: string;
  type: string;
  category?: string;
  fileUrl?: string;
  fileType?: string;
  mimeType?: string;
  status: string;
  rejectionReason?: string;
  reviewerNotes?: string;
  expiryDate?: string;
  createdAt?: string;
  updatedAt?: string;
};
export async function fetchDocuments() {
  const documents = normalizeList<UserDocument>(await apiRequest('/documents'), [
    'documents',
  ]);
  return documents.map(document => ({
    ...document,
    fileType: document.fileType || document.mimeType,
  }));
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
