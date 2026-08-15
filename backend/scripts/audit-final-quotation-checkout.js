const baseUrl = String(process.env.ESYGLOB_AUDIT_API_URL || 'https://api.esyglob.in/api').replace(/\/$/, '');
const webUrl = String(process.env.ESYGLOB_AUDIT_WEB_URL || 'https://esyglob.in').replace(/\/$/, '');
const quotationId = String(process.env.ESYGLOB_AUDIT_QUOTATION_ID || '').trim();
if (!quotationId) throw new Error('ESYGLOB_AUDIT_QUOTATION_ID is required');

async function login(email, password) {
  const response = await fetch(`${baseUrl}/auth/signin`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Login failed');
  const values = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie')];
  return { cookie: values.filter(Boolean).map(value => value.split(';')[0]).join('; '), user: payload.user || payload.data?.user };
}

async function call(path, { method = 'GET', body, cookie, expected = [200] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json();
  if (!expected.includes(response.status)) throw new Error(`${method} ${path}: ${response.status} ${payload.error || payload.message || ''}`);
  return payload.data ?? payload;
}

const id = value => String(value?._id || value?.id || value || '');
const buyer = await login(process.env.ESYGLOB_AUDIT_BUYER_EMAIL, process.env.ESYGLOB_AUDIT_BUYER_PASSWORD);
const seller = await login(process.env.ESYGLOB_AUDIT_SELLER_EMAIL, process.env.ESYGLOB_AUDIT_SELLER_PASSWORD);
let quotation = (await call(`/quotations/${quotationId}`, { cookie: buyer.cookie })).quotation;
if (quotation.status === 'buyer_accepted') {
  quotation = (await call(`/quotations/${quotationId}`, { method: 'PATCH', cookie: seller.cookie, body: {
    action: 'confirm', expectedNegotiationVersion: Number(quotation.negotiationVersion || 0),
    idempotencyKey: `checkout-audit-confirm-${quotationId}`, suppliedQuantity: Number(quotation.suppliedQuantity),
    minimumOrderQuantity: Number(quotation.minimumOrderQuantity), unitPrice: Number(quotation.currentOffer?.unitPrice || quotation.unitPrice),
    totalPrice: Number(quotation.currentOffer?.totalPrice || quotation.totalPrice), leadTime: Number(quotation.leadTime),
    paymentTerms: quotation.paymentTerms, shippingTerms: quotation.shippingTerms || quotation.incoterms,
    reason: 'Production audit: prepare locked Final Quotation for checkout verification.',
  } })).quotation;
}
let documentId = id(quotation.finalQuotation?.documentId);
if (quotation.finalQuotation?.status === 'awaiting_seller_signature') {
  await call(`/trade-workspace/quotation/${quotationId}/documents/${documentId}/sign`, { method: 'POST', cookie: seller.cookie, body: { signerName: seller.user?.fullName || seller.user?.email, signatureType: 'typed', signatureValue: seller.user?.fullName || 'Manufacturer', termsAccepted: true, termsVersion: 'final-quotation-terms-v1' } });
  quotation = (await call(`/quotations/${quotationId}`, { cookie: buyer.cookie })).quotation;
}
documentId = id(quotation.finalQuotation?.documentId);
if (quotation.finalQuotation?.status === 'awaiting_buyer_signature') {
  await call(`/trade-workspace/quotation/${quotationId}/documents/${documentId}/sign`, { method: 'POST', cookie: buyer.cookie, body: { signerName: buyer.user?.fullName || buyer.user?.email, signatureType: 'typed', signatureValue: buyer.user?.fullName || 'Buyer', termsAccepted: true, termsVersion: 'final-quotation-terms-v1' } });
  quotation = (await call(`/quotations/${quotationId}`, { cookie: buyer.cookie })).quotation;
}
const document = (quotation.tradeDocuments || []).find(item => id(item) === documentId);
const content = document?.metadata?.content || {};
const product = content.products?.[0] || {};
const pricing = content.pricing || {};
const expectedTotal = Number(product.unitPrice || 0) * Number(product.quantity || 0) + Number(pricing.shippingCost || 0) + Number(pricing.taxAmount || 0);
const documentChecks = {
  signedAndLocked: ['final_quotation_signed', 'won'].includes(quotation.status) && document?.status === 'completed' && Boolean(quotation.finalQuotation?.lockedAt),
  productIdentity: Boolean(product.productId && product.name && product.description && product.category && product.subcategory),
  productPresentation: Boolean(product.image && product.specifications),
  productCommercials: Boolean(Number(product.quantity) > 0 && product.unit && Number(product.minimumOrderQuantity) > 0 && Number(product.unitPrice) > 0),
  completePricing: Number(pricing.productTotal) === Number(product.totalPrice) && Number(pricing.finalPayableAmount) === expectedTotal && pricing.currency === quotation.currency,
  bothSignatures: ['buyer', 'seller'].every(role => document?.signatures?.some(item => item.signerRole === role)),
};
if (!Object.values(documentChecks).every(Boolean)) throw new Error(`Final Quotation content check failed: ${JSON.stringify(documentChecks)}`);

const order = (await call('/orders/start', { method: 'POST', cookie: seller.cookie, expected: [201], body: {
  rfqId: id(quotation.rfqId), quotationId, productId: id(quotation.productId),
  quantity: Number(quotation.suppliedQuantity), minimumOrderQuantity: Number(quotation.minimumOrderQuantity),
  unitPrice: Number(quotation.unitPrice), shippingCost: Number(quotation.shippingCost || 0),
  taxAmount: Number(quotation.taxes?.amount || 0), paymentTerms: quotation.paymentTerms,
  deliveryTerms: quotation.shippingTerms || quotation.incoterms, notes: 'Production audit: checkout reachability verification.',
} })).order;
const orderId = id(order);
const buyerOrder = (await call(`/orders/${orderId}`, { cookie: buyer.cookie })).order || await call(`/orders/${orderId}`, { cookie: buyer.cookie });
const pageResponse = await fetch(`${webUrl}/orders/${orderId}`, { redirect: 'manual' });
const checkoutChecks = {
  orderLinked: id(buyerOrder.quotationId) === quotationId && id(buyerOrder.rfqId) === id(quotation.rfqId),
  finalAmountPreserved: Number(buyerOrder.totalAmount) === Number(pricing.finalPayableAmount),
  checkoutInitialized: buyerOrder.status === 'pending_approval' && buyerOrder.checkout?.logisticsSelected === false && buyerOrder.checkout?.termsAccepted === false,
  buyerCanLoadOrder: Boolean(id(buyerOrder) === orderId),
  frontendOrderPageReachable: pageResponse.status >= 200 && pageResponse.status < 400,
};
if (!Object.values(checkoutChecks).every(Boolean)) throw new Error(`Checkout reachability check failed: ${JSON.stringify(checkoutChecks)}`);
console.log(JSON.stringify({ quotationId, finalQuotationDocumentId: documentId, orderId, checkoutUrl: `${webUrl}/orders/${orderId}`, documentChecks, checkoutChecks, product: { id: product.productId, name: product.name, description: product.description, category: product.category, subcategory: product.subcategory, quantity: product.quantity, unit: product.unit, minimumOrderQuantity: product.minimumOrderQuantity, unitPrice: product.unitPrice, productTotal: product.totalPrice }, pricing }, null, 2));
