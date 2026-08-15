const BASE_URL = String(process.env.ESYGLOB_AUDIT_API_URL || 'https://api.esyglob.in/api').replace(/\/$/, '');
const buyerCredentials = {
  email: process.env.ESYGLOB_AUDIT_BUYER_EMAIL,
  password: process.env.ESYGLOB_AUDIT_BUYER_PASSWORD,
};
const sellerCredentials = {
  email: process.env.ESYGLOB_AUDIT_SELLER_EMAIL,
  password: process.env.ESYGLOB_AUDIT_SELLER_PASSWORD,
};

for (const [name, value] of Object.entries({ ...buyerCredentials, ...Object.fromEntries(Object.entries(sellerCredentials).map(([key, value]) => [`seller_${key}`, value])) })) {
  if (!value) throw new Error(`Missing production audit credential: ${name}`);
}

const report = { startedAt: new Date().toISOString(), assertions: [], records: {}, requests: [] };

function record(name, passed, detail = '') {
  report.assertions.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`Assertion failed: ${name}${detail ? ` (${detail})` : ''}`);
}

function entity(payload, key) {
  const data = payload?.data ?? payload;
  return data?.[key] ?? data;
}

function list(payload, keys) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
}

function id(value) {
  return String(value?._id || value?.id || value || '');
}

async function request(path, { method = 'GET', body, cookie, expected = [200] } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      'user-agent': 'EsyGlob-RFQ-Production-Audit/1.0',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  report.requests.push({ method, path, status: response.status });
  if (!expected.includes(response.status)) {
    const message = payload?.error || payload?.message || text || response.statusText;
    throw Object.assign(new Error(`${method} ${path} returned ${response.status}: ${message}`), { status: response.status, payload });
  }
  return { response, payload };
}

async function login(credentials) {
  const { response, payload } = await request('/auth/signin', { method: 'POST', body: credentials });
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookies.map(value => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`Login for ${credentials.email} did not set a session cookie`);
  return { cookie, user: payload.user || payload.data?.user };
}

function actionKey(prefix) {
  return `audit-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function quotationDetail(cookie, quotationId) {
  return entity((await request(`/quotations/${quotationId}`, { cookie })).payload, 'quotation');
}

async function updateOffer(cookie, quotationId, quotation, body) {
  return entity((await request(`/quotations/${quotationId}`, {
    method: 'PATCH',
    cookie,
    body: {
      expectedNegotiationVersion: Number(quotation.negotiationVersion || 0),
      idempotencyKey: actionKey(body.action || 'revision'),
      ...body,
    },
  })).payload, 'quotation');
}

async function main() {
  const [buyer, seller] = await Promise.all([login(buyerCredentials), login(sellerCredentials)]);
  record('buyer account role', buyer.user?.roles?.includes('buyer'), buyer.user?.email);
  record('seller account role', seller.user?.roles?.includes('seller'), seller.user?.email);

  const productsPayload = (await request('/products?search=wood&limit=50')).payload;
  const products = list(productsPayload, ['products', 'items', 'results']);
  const product = products.find(item => /urban\s*wood/i.test(String(item.sellerId?.companyName || item.seller?.companyName || '')))
    || products.find(item => /wood/i.test(String(item.name || '')));
  record('real wood product found', product, products.map(item => item.name).join(', '));
  record('wood product belongs to supplied seller', /urban\s*wood/i.test(String(product.sellerId?.companyName || product.seller?.companyName || '')), product.sellerId?.companyName);
  const productId = id(product);
  const sellerProfileId = id(product.sellerId);
  report.records.productId = productId;

  const createdChat = entity((await request('/chat', {
    method: 'POST', cookie: buyer.cookie,
    body: { otherUserId: id(seller.user), productId, role: 'buyer', enquiry: true },
  })).payload, 'chat');
  const chatId = id(createdChat);
  const reusedChatPayload = (await request('/chat', {
    method: 'POST', cookie: buyer.cookie,
    body: { otherUserId: id(seller.user), productId, role: 'buyer', enquiry: true },
  })).payload;
  record('send enquiry reuses conversation', id(entity(reusedChatPayload, 'chat')) === chatId, chatId);
  await request(`/chat/${chatId}`, {
    method: 'POST', cookie: buyer.cookie,
    body: {
      content: `Production readiness enquiry for ${product.name}. Requested quantity: 100 pcs.`,
      messageType: 'product',
      productDetails: { productId, productName: product.name, image: product.images?.[0]?.url || product.images?.[0] || '', productLink: `/products/${productId}`, supplierName: product.sellerId?.companyName, supplierId: sellerProfileId },
    },
  });
  const sellerChat = (await request(`/chat/${chatId}?limit=100`, { cookie: seller.cookie })).payload;
  const enquiryMessages = list(sellerChat, ['messages', 'items']);
  record('enquiry message persisted for seller', enquiryMessages.some(item => String(item.content || '').includes('Production readiness enquiry')), `${enquiryMessages.length} messages`);
  record('enquiry product context persisted', enquiryMessages.some(item => id(item.productDetails?.productId) === productId), productId);
  const sellerNotificationsAfterEnquiry = list((await request('/notifications?limit=100', { cookie: seller.cookie })).payload, ['notifications', 'items']);
  record('seller enquiry notification persisted', sellerNotificationsAfterEnquiry.some(item => id(item.data?.relatedId) === chatId && item.notificationType === 'new_inquiry'), chatId);

  const auditSuffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const resumePrivateRfqId = String(process.env.ESYGLOB_AUDIT_PRIVATE_RFQ_ID || '').trim();
  const privateRfq = resumePrivateRfqId
    ? entity((await request(`/rfqs/${resumePrivateRfqId}`, { cookie: buyer.cookie })).payload, 'rfq')
    : entity((await request('/rfqs', {
    method: 'POST', cookie: buyer.cookie, expected: [201],
    body: {
      title: `Production audit wooden sofa RFQ ${auditSuffix}`,
      productId,
      description: 'Production-readiness private RFQ for a wooden sofa set with durable solid wood construction.',
      category: product.category,
      subcategory: product.subcategory,
      specifications: 'Solid wood frame; commercial-grade finish; product image and catalog context required.',
      quantity: 100,
      minimumOrderQuantity: 10,
      unit: 'pcs',
      targetPrice: 90,
      currency: 'INR',
      deliveryCountry: 'India',
      deliveryTimeline: '1month',
      deliveryPort: 'New Delhi',
      shippingPreference: 'Door delivery',
      incoterms: 'DAP',
      sellerId: sellerProfileId,
      visibility: 'private',
    },
  })).payload, 'rfq');
  const privateRfqId = id(privateRfq);
  report.records.privateRfqId = privateRfqId;
  record('private RFQ targets exact seller', id(privateRfq.sellerId) === sellerProfileId && id(privateRfq.sellerUserId) === id(seller.user), privateRfqId);
  record('private RFQ preserves product and taxonomy', id(privateRfq.productId) === productId && privateRfq.category === product.category && privateRfq.subcategory === product.subcategory);

  const sellerRfq = entity((await request(`/rfqs/${privateRfqId}`, { cookie: seller.cookie })).payload, 'rfq');
  record('seller can open exact private RFQ', id(sellerRfq) === privateRfqId);
  const otherBuyerAttempt = await request(`/rfqs/${privateRfqId}`, {
    method: 'PATCH', cookie: seller.cookie, body: { title: 'Unauthorized overwrite attempt' }, expected: [403],
  });
  record('seller cannot modify buyer RFQ fields', otherBuyerAttempt.response.status === 403);

  if (['submitted', 'active'].includes(sellerRfq.status)) {
    const acceptedRfq = entity((await request(`/rfqs/${privateRfqId}`, {
      method: 'PATCH', cookie: seller.cookie,
      body: { action: 'accept', reason: 'UrbanWood accepts the production audit RFQ and will prepare a quotation.' },
    })).payload, 'rfq');
    record('seller acceptance enables private quotation', acceptedRfq.status === 'seller_accepted', acceptedRfq.status);
  } else record('seller acceptance enables private quotation', ['seller_accepted', 'quoted', 'negotiating', 'converted'].includes(sellerRfq.status), sellerRfq.status);

  const resumeQuotationId = String(process.env.ESYGLOB_AUDIT_QUOTATION_ID || '').trim();
  let quotation = resumeQuotationId ? await quotationDetail(seller.cookie, resumeQuotationId) : entity((await request('/quotations', {
    method: 'POST', cookie: seller.cookie, expected: [201],
    body: {
      rfqId: privateRfqId,
      productId,
      unitPrice: 100,
      totalPrice: 10000,
      currency: 'INR',
      minimumOrderQuantity: 10,
      suppliedQuantity: 100,
      leadTime: 21,
      leadTimeUnit: 'days',
      productionTime: 14,
      productionTimeUnit: 'days',
      paymentTerms: '30% advance, balance before dispatch',
      advanceRequired: 30,
      incoterms: 'DAP',
      shippingCost: 0,
      shippingTerms: 'Door delivery included',
      packaging: { type: 'Export-grade protective packaging' },
      taxes: { taxRate: 0, amount: 0, description: 'Taxes as applicable' },
      description: product.description || product.name,
      specifications: 'Solid wood frame and commercial-grade finish.',
      notes: 'Initial production audit quotation.',
      sellerMessage: 'Initial offer: INR 100 per unit for 100 pieces.',
      expiryDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    },
  })).payload, 'quotation');
  const quotationId = id(quotation);
  report.records.privateQuotationId = quotationId;
  record('seller quotation total is backend-persisted', (quotation.negotiationHistory || []).some(item => item.action === 'submitted' && Number(item.totalPrice) === 10000), String(quotation.totalPrice));

  const buyerCannotRevise = await request(`/quotations/${quotationId}`, {
    method: 'PATCH', cookie: buyer.cookie,
    body: { expectedNegotiationVersion: Number(quotation.negotiationVersion || 0), unitPrice: 1 }, expected: [403],
  });
  record('buyer cannot modify seller quotation directly', buyerCannotRevise.response.status === 403);

  const priorPrices = () => (quotation.negotiationHistory || []).map(item => Number(item.unitPrice));
  if (!priorPrices().includes(90)) {
    const counterOneKey = actionKey('buyer-counter-90');
    const counterOneBody = { action: 'counter_offer', expectedNegotiationVersion: Number(quotation.negotiationVersion || 0), idempotencyKey: counterOneKey, unitPrice: 90, totalPrice: 9000, suppliedQuantity: 100, minimumOrderQuantity: 10, leadTime: 21, leadTimeUnit: 'days', buyerMessage: 'Buyer counter #1 at INR 90 per unit.' };
    quotation = entity((await request(`/quotations/${quotationId}`, { method: 'PATCH', cookie: buyer.cookie, body: counterOneBody })).payload, 'quotation');
    const versionAfterCounterOne = Number(quotation.negotiationVersion);
    const replay = (await request(`/quotations/${quotationId}`, { method: 'PATCH', cookie: buyer.cookie, body: counterOneBody })).payload;
    record('counter offer is idempotent', replay.reused === true && Number(entity(replay, 'quotation').negotiationVersion) === versionAfterCounterOne);
  } else record('counter offer is idempotent', true, 'verified before resume');
  record('buyer counter remains actionable', priorPrices().includes(90), quotation.status);

  if (!priorPrices().includes(95)) quotation = await updateOffer(seller.cookie, quotationId, quotation, { unitPrice: 95, totalPrice: 9500, suppliedQuantity: 100, minimumOrderQuantity: 10, leadTime: 21, leadTimeUnit: 'days', sellerMessage: 'Seller revision #1 at INR 95 per unit.' });
  record('seller revision after counter succeeds', priorPrices().includes(95), quotation.status);
  if (!priorPrices().includes(92)) quotation = await updateOffer(buyer.cookie, quotationId, quotation, { action: 'counter_offer', unitPrice: 92, totalPrice: 9200, suppliedQuantity: 100, minimumOrderQuantity: 10, leadTime: 21, leadTimeUnit: 'days', buyerMessage: 'Buyer counter #2 at INR 92 per unit.' });
  if (!priorPrices().includes(93)) quotation = await updateOffer(seller.cookie, quotationId, quotation, { unitPrice: 93, totalPrice: 9300, suppliedQuantity: 100, minimumOrderQuantity: 10, leadTime: 21, leadTimeUnit: 'days', sellerMessage: 'Seller revision #2 and final offer at INR 93 per unit.' });
  record('multiple counter/revision rounds remain open', priorPrices().includes(93) && ['revised', 'buyer_accepted', 'final_quotation_pending', 'final_quotation_signed'].includes(quotation.status), quotation.status);

  if (quotation.status === 'revised') quotation = entity((await request(`/quotations/${quotationId}`, {
    method: 'PUT', cookie: buyer.cookie,
    body: { action: 'accept', expectedNegotiationVersion: Number(quotation.negotiationVersion || 0), idempotencyKey: actionKey('buyer-accept'), reason: 'Buyer accepts the final INR 93 offer.' },
  })).payload, 'quotation');
  record('buyer acceptance locks negotiated offer', ['buyer_accepted', 'final_quotation_pending', 'final_quotation_signed'].includes(quotation.status) && Number(quotation.currentOffer?.unitPrice) === 93, quotation.status);

  if (quotation.status === 'buyer_accepted') quotation = await updateOffer(seller.cookie, quotationId, quotation, { action: 'confirm', unitPrice: 93, totalPrice: 9300, suppliedQuantity: 100, minimumOrderQuantity: 10, leadTime: 21, leadTimeUnit: 'days', paymentTerms: '30% advance, balance before dispatch', shippingTerms: 'Door delivery included', reason: 'Seller confirms final commercial terms.' });
  const documentId = id(quotation.finalQuotation?.documentId);
  report.records.finalQuotationDocumentId = documentId;
  record('final quotation generated from accepted terms', ['final_quotation_pending', 'final_quotation_signed'].includes(quotation.status) && documentId && Number(quotation.unitPrice) === 93 && Number(quotation.totalPrice) === 9300, quotation.finalQuotation?.status);

  if (quotation.finalQuotation?.status === 'awaiting_seller_signature') await request(`/trade-workspace/quotation/${quotationId}/documents/${documentId}/sign`, {
    method: 'POST', cookie: seller.cookie,
    body: { signerName: seller.user.fullName || seller.user.email, signatureType: 'typed', signatureValue: seller.user.fullName || 'UrbanWood Industries', termsAccepted: true, termsVersion: 'final-quotation-terms-v1' },
  });
  quotation = await quotationDetail(buyer.cookie, quotationId);
  if (quotation.finalQuotation?.status === 'awaiting_buyer_signature') await request(`/trade-workspace/quotation/${quotationId}/documents/${documentId}/sign`, {
    method: 'POST', cookie: buyer.cookie,
    body: { signerName: buyer.user.fullName || buyer.user.email, signatureType: 'typed', signatureValue: buyer.user.fullName || 'Mohit', termsAccepted: true, termsVersion: 'final-quotation-terms-v1' },
  });
  quotation = await quotationDetail(buyer.cookie, quotationId);
  const offerPrices = (quotation.negotiationHistory || []).filter(item => ['submitted', 'buyer_counter', 'seller_revision', 'accepted'].includes(item.action)).map(item => Number(item.unitPrice));
  record('buyer signature persists and final quotation is locked', quotation.status === 'final_quotation_signed' && quotation.finalQuotation?.status === 'signed' && quotation.finalQuotation?.buyerSignedAt && quotation.finalQuotation?.lockedAt, quotation.status);
  record('complete negotiation price history persists', [100, 90, 95, 92, 93].every(price => offerPrices.includes(price)), offerPrices.join(', '));

  const privateChatId = id(quotation.rfqId?.conversationId || sellerRfq.conversationId);
  const privateChatPayload = (await request(`/chat/${privateChatId}?limit=100`, { cookie: buyer.cookie })).payload;
  const lifecycleMessages = list(privateChatPayload, ['messages', 'items']);
  record('negotiation messages persist', [90, 95, 92, 93].every(price => lifecycleMessages.some(item => String(item.content || '').includes(String(price)))), `${lifecycleMessages.length} messages`);
  const buyerNotifications = list((await request('/notifications?limit=100', { cookie: buyer.cookie })).payload, ['notifications', 'items']);
  const sellerNotifications = list((await request('/notifications?limit=100', { cookie: seller.cookie })).payload, ['notifications', 'items']);
  record('buyer lifecycle notifications persist', ['quotation_received', 'quotation_revised', 'document_signed'].every(type => buyerNotifications.some(item => item.notificationType === type)));
  record('seller lifecycle notifications persist', ['quotation_counter_offer', 'quotation_accepted', 'document_signed'].every(type => sellerNotifications.some(item => item.notificationType === type)));

  const resumePublicRfqId = String(process.env.ESYGLOB_AUDIT_PUBLIC_RFQ_ID || '').trim();
  const publicRfq = resumePublicRfqId ? entity((await request(`/rfqs/${resumePublicRfqId}`, { cookie: buyer.cookie })).payload, 'rfq') : entity((await request('/rfqs', {
    method: 'POST', cookie: buyer.cookie, expected: [201],
    body: {
      title: `Public production audit wooden furniture RFQ ${auditSuffix}`,
      productId,
      description: 'Public sourcing request for wooden furniture using the existing marketplace taxonomy.',
      category: product.category,
      subcategory: product.subcategory,
      specifications: 'Commercial-grade wooden furniture suitable for repeated use.',
      quantity: 100,
      minimumOrderQuantity: 10,
      unit: 'pcs',
      targetPrice: 105,
      currency: 'INR',
      deliveryCountry: 'India',
      deliveryTimeline: '1month',
      deliveryPort: 'New Delhi',
      incoterms: 'DAP',
      visibility: 'public',
    },
  })).payload, 'rfq');
  const publicRfqId = id(publicRfq);
  report.records.publicRfqId = publicRfqId;
  record('public RFQ uses exact existing taxonomy', publicRfq.visibility === 'public' && publicRfq.category === product.category && publicRfq.subcategory === product.subcategory, `${publicRfq.category}/${publicRfq.subcategory}`);
  const publicListing = list((await request(`/rfqs?scope=public${resumePublicRfqId ? '' : `&search=${encodeURIComponent(auditSuffix)}`}&limit=50`)).payload, ['rfqs', 'items', 'results']);
  record('public RFQ appears in public listing', publicListing.some(item => id(item) === publicRfqId), publicRfqId);
  const sellerPublicDetail = entity((await request(`/rfqs/${publicRfqId}`, { cookie: seller.cookie })).payload, 'rfq');
  record('matched seller can open public RFQ', id(sellerPublicDetail) === publicRfqId);

  let publicQuotation = entity((await request('/quotations', {
    method: 'POST', cookie: seller.cookie, expected: [201],
    body: {
      rfqId: publicRfqId, productId, unitPrice: 110, totalPrice: 11000,
      currency: 'INR', minimumOrderQuantity: 10, suppliedQuantity: 100,
      leadTime: 24, leadTimeUnit: 'days', paymentTerms: '30% advance, balance before dispatch',
      incoterms: 'DAP', shippingCost: 0, shippingTerms: 'Door delivery included',
      description: product.description || product.name,
      specifications: 'Public RFQ response linked to the matching UrbanWood product.',
      sellerMessage: 'Public RFQ offer at INR 110 per unit.',
      expiryDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      idempotencyKey: actionKey('public-quotation'),
    },
  })).payload, 'quotation');
  const publicQuotationId = id(publicQuotation);
  report.records.publicQuotationId = publicQuotationId;
  record('matched seller quotation reaches buyer', publicQuotation.status === 'submitted' && Number(publicQuotation.unitPrice) === 110, publicQuotationId);
  publicQuotation = await updateOffer(buyer.cookie, publicQuotationId, publicQuotation, { action: 'counter_offer', unitPrice: 105, totalPrice: 10500, suppliedQuantity: 100, minimumOrderQuantity: 10, leadTime: 24, leadTimeUnit: 'days', buyerMessage: 'Public RFQ buyer counter at INR 105 per unit.' });
  publicQuotation = await updateOffer(seller.cookie, publicQuotationId, publicQuotation, { unitPrice: 107, totalPrice: 10700, suppliedQuantity: 100, minimumOrderQuantity: 10, leadTime: 24, leadTimeUnit: 'days', sellerMessage: 'Public RFQ final seller revision at INR 107 per unit.' });
  publicQuotation = entity((await request(`/quotations/${publicQuotationId}`, { method: 'PUT', cookie: buyer.cookie, body: { action: 'accept', expectedNegotiationVersion: Number(publicQuotation.negotiationVersion || 0), idempotencyKey: actionKey('public-accept'), reason: 'Buyer accepts the public RFQ quotation.' } })).payload, 'quotation');
  record('public RFQ response supports negotiation and acceptance', publicQuotation.status === 'buyer_accepted' && Number(publicQuotation.currentOffer?.unitPrice) === 107, publicQuotation.status);

  report.completedAt = new Date().toISOString();
  report.summary = { passed: report.assertions.filter(item => item.passed).length, failed: report.assertions.filter(item => !item.passed).length, requests: report.requests.length };
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  report.completedAt = new Date().toISOString();
  report.failure = { message: error.message, status: error.status, payload: error.payload };
  report.summary = { passed: report.assertions.filter(item => item.passed).length, failed: report.assertions.filter(item => !item.passed).length + 1, requests: report.requests.length };
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
