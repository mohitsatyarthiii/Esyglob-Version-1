import mongoose from 'mongoose';

export const BUYER_STATUS_GROUPS = {
  draft: ['draft'],
  active: ['active', 'submitted', 'pending', 'viewed', 'information_requested', 'seller_accepted', 'ready_for_quotation'],
  quoted: ['replied', 'quoted'],
  negotiating: ['negotiating'],
  closed: ['closed', 'archived', 'expired', 'rejected'],
  converted: ['order_initiated', 'converted'],
};

export const OPEN_RFQ_STATUSES = [
  'active',
  'submitted',
  'pending',
  'viewed',
  'seller_accepted',
  'ready_for_quotation',
  'replied',
  'quoted',
  'negotiating',
];

export const VALID_UNITS = [
  'pcs',
  'kg',
  'boxes',
  'tons',
  'liters',
  'meters',
  'rolls',
  'sheets',
  'other',
];

export function clean(value) {
  return String(value || '').trim();
}

export function idOf(value) {
  return String(value?._id || value || '');
}

export function idMatches(value, expected) {
  return Boolean(value && expected && idOf(value) === String(expected));
}

export function idListIncludes(values = [], expected) {
  return Array.isArray(values) && values.some((value) => idMatches(value, expected));
}

export function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

export function getSort(sort, order) {
  const direction = order === 'asc' ? 1 : -1;
  if (sort === 'quantity') return { quantity: direction };
  if (sort === 'quotationCount') return { quotationCount: direction, createdAt: -1 };
  return { createdAt: direction };
}

export function normalizeFiles(files = [], type = 'other') {
  return files
    .filter(Boolean)
    .map((file) => ({
      url: file.url || file,
      filename: file.filename || file.name || 'Attachment',
      type: file.type || type,
      uploadedAt: file.uploadedAt || new Date(),
    }));
}

export function buildRfqSummary({ rfq, product, body }) {
  return [
    'RFQ Submitted',
    '',
    `Product: ${product.name}`,
    `Quantity: ${rfq.quantity.toLocaleString()} ${rfq.unit}`,
    rfq.targetPrice ? `Target Price: ${rfq.currency} ${rfq.targetPrice}` : null,
    `Destination: ${rfq.deliveryCountry}`,
    body.customSpecifications ? `Specifications: ${body.customSpecifications}` : null,
    body.customizationRequirements
      ? `Customization: ${body.customizationRequirements}`
      : null,
    body.packagingRequirements ? `Packaging: ${body.packagingRequirements}` : null,
    body.deliveryRequirements
      ? `Delivery Requirements: ${body.deliveryRequirements}`
      : null,
    body.additionalNotes ? `Notes: ${body.additionalNotes}` : null,
    '',
    `RFQ ID: ${rfq._id}`,
  ]
    .filter(Boolean)
    .join('\n');
}
