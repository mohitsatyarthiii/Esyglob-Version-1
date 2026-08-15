const baseUrl = String(process.env.ESYGLOB_AUDIT_API_URL || 'https://api.esyglob.in/api').replace(/\/$/, '');
const rfqId = String(process.env.ESYGLOB_AUDIT_PUBLIC_RFQ_ID || '').trim();
const productId = String(process.env.ESYGLOB_AUDIT_PRODUCT_ID || '').trim();
if (!rfqId || !productId) throw new Error('Public RFQ and product IDs are required');

async function call(path, { method = 'GET', body, cookie, expected = [200] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json();
  if (!expected.includes(response.status)) throw new Error(`${method} ${path}: ${response.status} ${payload.error || payload.message || ''}`);
  return payload.data ?? payload;
}

async function login(email, password) {
  const response = await fetch(`${baseUrl}/auth/signin`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Login failed');
  const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie')];
  return { user: payload.user, cookie: setCookies.filter(Boolean).map(value => value.split(';')[0]).join('; ') };
}

const id = value => String(value?._id || value?.id || value || '');
const key = suffix => `production-audit-public-${rfqId}-${suffix}`;

const buyer = await login(process.env.ESYGLOB_AUDIT_BUYER_EMAIL, process.env.ESYGLOB_AUDIT_BUYER_PASSWORD);
const seller = await login(process.env.ESYGLOB_AUDIT_SELLER_EMAIL, process.env.ESYGLOB_AUDIT_SELLER_PASSWORD);
const detail = await call(`/rfqs/${rfqId}`, { cookie: seller.cookie });
if (detail.rfq?.visibility !== 'public') throw new Error('Target RFQ is not public');
let quotation = (detail.quotations || []).find(item => id(item.userId) === id(seller.user));

if (!quotation) quotation = (await call('/quotations', { method: 'POST', cookie: seller.cookie, expected: [201], body: {
  rfqId, productId, unitPrice: 110, totalPrice: 11000, currency: 'INR', minimumOrderQuantity: 10,
  suppliedQuantity: 100, leadTime: 24, leadTimeUnit: 'days', paymentTerms: '30% advance, balance before dispatch',
  incoterms: 'DAP', shippingCost: 0, shippingTerms: 'Door delivery included',
  specifications: 'Public RFQ response linked to the matching UrbanWood product.',
  sellerMessage: 'Public RFQ offer at INR 110 per unit.',
  expiryDate: new Date(Date.now() + 30 * 86400000).toISOString(), idempotencyKey: key('submitted'),
} })).quotation;

const quotationId = id(quotation);
const prices = () => (quotation.negotiationHistory || []).map(item => Number(item.unitPrice));
const patchOffer = async (cookie, suffix, body) => {
  const result = await call(`/quotations/${quotationId}`, { method: 'PATCH', cookie, body: { expectedNegotiationVersion: Number(quotation.negotiationVersion || 0), idempotencyKey: key(suffix), ...body } });
  quotation = result.quotation;
};

if (!prices().includes(105)) await patchOffer(buyer.cookie, 'buyer-counter-105', { action: 'counter_offer', unitPrice: 105, totalPrice: 10500, suppliedQuantity: 100, minimumOrderQuantity: 10, leadTime: 24, leadTimeUnit: 'days', buyerMessage: 'Public RFQ buyer counter at INR 105 per unit.' });
if (!prices().includes(107)) await patchOffer(seller.cookie, 'seller-revision-107', { unitPrice: 107, totalPrice: 10700, suppliedQuantity: 100, minimumOrderQuantity: 10, leadTime: 24, leadTimeUnit: 'days', sellerMessage: 'Public RFQ final seller revision at INR 107 per unit.' });
if (quotation.status === 'revised') quotation = (await call(`/quotations/${quotationId}`, { method: 'PUT', cookie: buyer.cookie, body: { action: 'accept', expectedNegotiationVersion: Number(quotation.negotiationVersion || 0), idempotencyKey: key('buyer-accept'), reason: 'Buyer accepts the public RFQ quotation.' } })).quotation;

quotation = (await call(`/quotations/${quotationId}`, { cookie: buyer.cookie })).quotation;
const expectedPrices = [110, 105, 107];
if (!expectedPrices.every(price => prices().includes(price)) || quotation.status !== 'buyer_accepted') throw new Error(`Public lifecycle incomplete: ${quotation.status}; ${prices().join(', ')}`);
console.log(JSON.stringify({ publicRfqId: rfqId, publicQuotationId: quotationId, status: quotation.status, prices: prices(), checks: ['matched seller access', 'quotation response', 'buyer counter', 'seller revision', 'buyer acceptance'] }, null, 2));
