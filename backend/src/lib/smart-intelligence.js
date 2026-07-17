import { matchKnowledgeResponse } from './marketplace-knowledge.js';

function isAdvancedReasoning(message) {
  return /compare|recommend|best|better|analy[sz]e|analysis|forecast|trend|strategy|competitor|opportunit|risk|growth|why|should i|which country|lowest price|highest demand|subscription|membership|premium|plan pricing|payment method|dispute.*status|shipment.*status|trade assurance.*status/i.test(message || '');
}

function isProductInfoIntent(message) {
  return /product (details|detail|specification|specifications|info|information)|tell me about.*product|what is this product|about this product/i.test(message || '');
}

function isSupplierInfoIntent(message) {
  return /supplier (details|detail|profile|info|information|verification)|manufacturer (details|profile|info|information)|tell me about.*supplier|about this supplier/i.test(message || '');
}

function money(value, currency = 'INR') {
  const amount = Number(value || 0);
  if (!amount) return 'Price on request';
  return `${currency} ${amount.toLocaleString('en-IN')}`;
}

function firstSpecLines(specifications = {}) {
  return Object.entries(specifications || {})
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim())
    .slice(0, 5)
    .map(([key, value]) => `- ${key}: ${value}`);
}

function productInstantResponse(product) {
  const supplier = product.sellerId;
  const specLines = firstSpecLines(product.specifications);
  return [
    `${product.name}`,
    '',
    `- Category: ${product.category || 'General'}${product.subcategory ? ` / ${product.subcategory}` : ''}`,
    `- Price: ${money(product.price, product.currency)}`,
    `- MOQ: ${product.minimumOrderQuantity || 1}`,
    product.sampleAvailable || product.samplePrice ? `- Sample: ${money(product.samplePrice || product.price, product.currency)}` : '',
    product.leadTime?.value ? `- Lead time: ${product.leadTime.value} ${product.leadTime.unit || 'days'}` : '',
    supplier?.companyName ? `- Supplier: ${supplier.companyName}${supplier.isVerified ? ' (verified)' : ''}` : '',
    product.description ? `\n${String(product.description).slice(0, 420)}` : '',
    specLines.length ? `\nSpecifications:\n${specLines.join('\n')}` : '',
    `\nOpen product: /products/${product._id}`,
    supplier?._id ? `Open supplier: /manufacturers/${supplier._id}` : '',
  ].filter(Boolean).join('\n');
}

function supplierInstantResponse(supplier) {
  return [
    `${supplier.companyName || 'Supplier profile'}`,
    '',
    `- Type: ${supplier.companyType || 'Supplier'}`,
    `- Verification: ${supplier.isVerified ? 'Verified' : 'Not verified yet'}`,
    supplier.rating ? `- Rating: ${supplier.rating}/5` : '',
    supplier.trustScore ? `- Trust score: ${supplier.trustScore}/100` : '',
    supplier.address?.country || supplier.address?.state
      ? `- Location: ${[supplier.address?.city, supplier.address?.state, supplier.address?.country].filter(Boolean).join(', ')}`
      : '',
    supplier.productCategories?.length
      ? `- Product categories: ${supplier.productCategories.slice(0, 5).join(', ')}`
      : '',
    supplier.exportMarkets?.length
      ? `- Export markets: ${supplier.exportMarkets.slice(0, 5).join(', ')}`
      : '',
    supplier.companyDescription ? `\n${String(supplier.companyDescription).slice(0, 420)}` : '',
    `\nOpen supplier: /manufacturers/${supplier._id}`,
  ].filter(Boolean).join('\n');
}

function searchInstantResponse(message, results = {}) {
  const products = (results.products || []).slice(0, 10);
  const suppliers = (results.suppliers || []).slice(0, 10);
  const categories = (results.categories || []).slice(0, 5);
  const services = (results.services || []).slice(0, 5);
  const total = products.length + suppliers.length + categories.length + services.length;
  if (!total) return null;

  const lines = [
    `I found marketplace matches for "${message}". Here are the strongest results from EsyGlob:`,
  ];

  if (products.length) {
    lines.push('\nProducts:');
    products.forEach(product => {
      const supplier = product.sellerId?.companyName
        ? ` | ${product.sellerId.companyName}${product.sellerId.isVerified ? ' verified' : ''}`
        : '';
      lines.push(`- ${product.name} | ${money(product.price, product.currency)} | MOQ ${product.minimumOrderQuantity || 1}${supplier} | /products/${product._id}`);
    });
  }

  if (suppliers.length) {
    lines.push('\nSuppliers:');
    suppliers.forEach(supplier => {
      lines.push(`- ${supplier.companyName || 'Supplier'} | ${supplier.companyType || 'supplier'} | ${supplier.address?.country || 'Global'} | ${supplier.isVerified ? 'Verified' : 'Not verified'} | /manufacturers/${supplier._id}`);
    });
  }

  if (categories.length) {
    lines.push('\nCategories:');
    categories.forEach(cat => lines.push(`- ${cat.name} | /categories/${encodeURIComponent(cat.slug || cat.name)}`));
  }

  if (services.length) {
    lines.push('\nServices:');
    services.forEach(service => lines.push(`- ${service.title} | /services/${service.key}`));
  }

  lines.push('\nNext step: open the closest product or supplier, message them with your quantity/specifications, or create an RFQ if you want multiple suppliers to quote.');
  return lines.join('\n');
}

export function resolveSmartResponse({ message, results = null, forceAI = false }) {
  if (forceAI || isAdvancedReasoning(message)) {
    return { shouldUseAI: true, source: 'advanced_reasoning' };
  }

  const knowledge = matchKnowledgeResponse(message);
  if (knowledge) {
    return { shouldUseAI: false, ...knowledge };
  }

  if (results) {
    if (isProductInfoIntent(message) && results.products?.[0]) {
      return {
        shouldUseAI: false,
        source: 'marketplace_product_data',
        response: productInstantResponse(results.products[0]),
      };
    }
    if (isSupplierInfoIntent(message) && results.suppliers?.[0]) {
      return {
        shouldUseAI: false,
        source: 'marketplace_supplier_data',
        response: supplierInstantResponse(results.suppliers[0]),
      };
    }

    const response = searchInstantResponse(message, results);
    if (response) {
      return { shouldUseAI: false, source: 'marketplace_search', response };
    }
  }

  return { shouldUseAI: true, source: 'ai_required' };
}

export function buildDeterministicInsightSummary({ mode, product, country, context }) {
  const productName = product?.name || 'Selected product';
  const supplierCount = context?.suppliers?.length || 0;
  const productCount = context?.products?.length || 0;
  const rfqCount = context?.rfqs?.length || 0;
  const topSuppliers = (context?.suppliers || []).slice(0, 3).map(s => s.companyName).filter(Boolean);
  const markets = (context?.countries || []).slice(0, 4).map(item => item.name || item);

  if (mode === 'country_rd') {
    return `${country} research for ${productName} is generated from platform product, supplier, RFQ, and country signals. EsyGlob currently found ${productCount} related products, ${supplierCount} supplier profiles, and ${rfqCount} RFQ signals. Use the rankings, trade requirement tables, and supplier lists to validate demand before sourcing or selling in ${country}.`;
  }

  if (mode === 'opportunity_finder') {
    return `${productName} opportunity scoring is calculated from modeled demand, competition, risk, profitability, supplier density, and available marketplace signals. Strong next steps are to validate the top countries with RFQs, compare verified suppliers, request samples, and check compliance before a bulk order.`;
  }

  return `${productName} research is generated from marketplace product data, supplier density, category signals, RFQs, and modeled import/export indicators. EsyGlob found ${productCount} related products and ${supplierCount} supplier profiles${topSuppliers.length ? ` including ${topSuppliers.join(', ')}` : ''}. Priority markets to review include ${markets.join(', ') || 'available supplier countries'}.`;
}

export function shouldUseAIForInsight({ body = {} }) {
  const text = `${body.query || ''} ${body.prompt || ''} ${body.question || ''} ${body.analysisType || ''}`;
  return /strateg|competitor|forecast|trend|why|recommend|explain|interpret|advanced|deep/i.test(text);
}
