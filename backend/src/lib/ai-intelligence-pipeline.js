const INTENTS = [
  ['supplier_search', /supplier|manufacturer|factory/i],
  ['product_search', /(find|search|source|compare).*product|product.*(search|supplier|alternative)/i],
  ['trade_advice', /\b(moq|minimum order|incoterms?|fob|cif|exw|ddp|ce certification|certificate of origin|bill of lading|import documents?|export documents?|customs documents?)\b/i],
  ['rfq', /\brfq\b|request for quotation|आरएफक्यू|कोटेशन.*अनुरोध|cotización/i],
  ['quotation', /quotation|quote/i],
  ['order', /order|purchase lifecycle|track|ऑर्डर|आदेश|pedido|commande/i],
  ['shipping', /shipping|shipment|logistics|incoterm/i],
  ['trade_assurance', /trade assurance|escrow|buyer protection/i],
  ['payment', /payment|invoice|wallet/i],
  ['membership', /membership|subscription|plan/i],
  ['policy', /policy|return|refund|dispute/i],
  ['hs_code', /hs\s*code|tariff|customs classification/i],
  ['market_research', /market research|market insight|demand|trend|import|export/i],
  ['platform_help', /how (do|does|to)|help|guide|esyglob/i],
];

const PRIVATE = /\b(my|our|mera|meri|mere|hamara|mi|mon|ma|mes)\s+(order|rfq|quotation|quote|message|invoice|payment|address|profile|membership|company|saved|document)|(मेरा|मेरी|मेरे|हमारा|हमारी)\s+(ऑर्डर|आदेश|आरएफक्यू|कोटेशन|संदेश|भुगतान|पता|प्रोफ़ाइल|दस्तावेज़)/iu;

export function detectLanguage(message = '', previous = 'en') {
  if (/[\u0600-\u06ff]/u.test(message)) return 'ar';
  if (/[\u4e00-\u9fff]/u.test(message)) return 'zh';
  if (/[\u3040-\u30ff]/u.test(message)) return 'ja';
  if (/[\u0900-\u097f]/u.test(message)) return 'hi';
  if (/\b(kya|kaise|mujhe|mera|hai|hain|chahiye|batao)\b/i.test(message)) return 'hinglish';
  return /[a-z]/i.test(message) ? 'en' : previous;
}

export function analyzeRequest({ message, role = 'general', previousLanguage = 'en' }) {
  const intent = INTENTS.find(([, pattern]) => pattern.test(message))?.[0] || 'general_knowledge';
  const language = detectLanguage(message, previousLanguage);
  const requiresPrivateData = PRIVATE.test(message);
  const greeting = /^(hi|hello|hey|namaste|hola|bonjour|thanks|thank you|shukriya|धन्यवाद|नमस्ते)[\s.!?]*$/iu.test(message);
  const liveInformation = /\b202[4-9]\b/.test(message) || /\b(current|today|latest|right now|live|recent|new|breaking)\b.*\b(duty|tariff|rate|regulation|policy|news|price|statistics|score|weather|launch|government|company|geopolitic|exchange)|\b(news|stock|share price|cricket|sports score|weather|exchange rate|product launch|government policy|regulation|tariff|geopolitic)\b.*\b(current|today|latest|live|recent|now)\b/i.test(message);
  const platformIntent = ['rfq', 'quotation', 'order', 'shipping', 'trade_assurance', 'payment', 'membership', 'policy', 'platform_help', 'hs_code', 'market_research'].includes(intent);
  const hasMarketplaceDiscovery = /\b(find|show|search|compare|source|recommend)\b/i.test(message)
    && /\b(suppliers?|manufacturers?|factories|factory|products?|prices?|moq)\b/i.test(message);
  const hasKnowledgeQuestion = /\b(how|why|explain|guide|documents?|process|risk|compliance|import|export|shipping|customs|certification|policy)\b/i.test(message);
  const mixedQuery = hasMarketplaceDiscovery && hasKnowledgeQuestion;
  const route = greeting ? 'greeting'
    : requiresPrivateData ? 'private_data'
    : liveInformation ? 'live_information'
    : mixedQuery ? 'mixed'
    : ['product_search', 'supplier_search'].includes(intent) ? 'marketplace_data'
    : intent === 'trade_advice' ? 'knowledge_data'
    : platformIntent ? 'platform_knowledge'
    : 'general_knowledge';
  const sources = mixedQuery ? ['products', 'suppliers', 'knowledge_base']
    : intent === 'product_search' ? ['products', 'suppliers']
    : intent === 'supplier_search' ? ['suppliers', 'products']
    : intent === 'hs_code' ? ['hs_codes', 'knowledge_base']
    : requiresPrivateData ? ['user_data', 'knowledge_base']
    : route === 'greeting' || route === 'general_knowledge' ? ['model_knowledge']
    : route === 'live_information' ? ['live_search']
    : ['knowledge_base'];
  return { intent, language, role, route, requiresPrivateData, sources, classifiedAt: Date.now() };
}

export function rewriteSearchQuery({ message = '', intelligence = {}, memory = {} }) {
  let rewritten = String(message || '').trim().replace(/\s+/g, ' ');
  const previousEntities = memory.entities || {};
  const refersBack = /\b(it|this|that|those|them|same|iske|iska|uska|yeh|woh)\b/i.test(rewritten);
  if (refersBack) {
    const contextTerms = [
      previousEntities.product,
      previousEntities.manufacturer,
      previousEntities.country,
      previousEntities.category,
    ].filter(Boolean);
    if (contextTerms.length) rewritten = `${rewritten} Context: ${contextTerms.join(', ')}`;
  }

  const expansions = [
    [/\bmoq\b/gi, 'minimum order quantity (MOQ)'],
    [/\bchina se\b/gi, 'from China'],
    [/\bimport karna hai\b/gi, 'import process, sourcing, customs, duties, shipping and documents'],
    [/\bexport karna hai\b/gi, 'export process, compliance, shipping and documents'],
    [/\bmanufacturer(s)?\b/gi, 'verified manufacturer$1'],
  ];
  for (const [pattern, replacement] of expansions) rewritten = rewritten.replace(pattern, replacement);

  const routeHint = {
    marketplace_data: 'marketplace products and suppliers',
    knowledge_data: 'trade guidance and business knowledge',
    platform_knowledge: 'EsyGlob platform guidance',
    private_data: 'authenticated user records',
    mixed: 'marketplace matches plus trade guidance',
  }[intelligence.route];
  return `${rewritten}${routeHint ? ` — ${routeHint}` : ''}`.slice(0, 700);
}

export function buildConversationMemory({ messages = [], context = {}, language = 'en' } = {}) {
  const maxChars = Math.max(3_000, Number(process.env.AI_MEMORY_MAX_CHARS || 6_000));
  const importantPattern = /\b(remember|always|never|prefer|my company|our company|budget|currency|country|language|call me|instruction|requirement|must|do not)\b/i;
  const durable = messages
    .slice(0, -10)
    .filter(item => item.role === 'user' && importantPattern.test(String(item.content || '')))
    .slice(-8);
  const selected = [...durable, ...messages.slice(-10)].filter((item, index, all) => all.indexOf(item) === index);
  let used = 0;
  const recent = [];
  for (const item of selected.reverse()) {
    const content = String(item.content || '').slice(0, 800);
    if (used + content.length > maxChars && recent.length >= 6) continue;
    recent.unshift({ ...item, content });
    used += content.length;
  }
  const userMessages = recent.filter(item => item.role === 'user').map(item => String(item.content || ''));
  const joined = userMessages.join(' ');
  const entityPatterns = {
    country: /\b(India|China|UAE|United Arab Emirates|USA|United States|UK|United Kingdom|Germany|Japan|Australia|Canada|Gujarat)\b/i,
    product: /\b(steel pipes?|textiles?|chemicals?|electronics?|machinery|rice|cotton|packaging|solar panels?)\b/i,
    manufacturer: /\b(?:supplier|manufacturer|factory)\s+(?:named\s+)?([A-Z][\w& -]{2,50})/i,
  };
  const entities = {
    ...(context.entities || {}),
    ...(context.productId ? { productId: String(context.productId) } : {}),
    ...(context.manufacturerId || context.sellerId
      ? { manufacturerId: String(context.manufacturerId || context.sellerId) }
      : {}),
    ...(context.productName ? { product: String(context.productName) } : {}),
    ...(context.manufacturerName || context.sellerName
      ? { manufacturer: String(context.manufacturerName || context.sellerName) }
      : {}),
    ...(context.sourcePath ? { currentPage: String(context.sourcePath) } : {}),
  };
  for (const [key, pattern] of Object.entries(entityPatterns)) {
    const match = joined.match(pattern);
    if (match) entities[key] = match[1] || match[0];
  }
  const preferences = { ...(context.preferences || {}) };
  const currency = joined.match(/\b(INR|USD|EUR|GBP|AED|CNY|JPY|AUD)\b/i);
  if (currency) preferences.currency = currency[1].toUpperCase();
  if (/\bverified (supplier|manufacturer|factory)/i.test(joined)) preferences.verifiedSuppliers = true;
  if (/\b(low|small|minimum)\s+moq\b|\blow minimum order\b/i.test(joined)) preferences.lowMoq = true;
  return {
    language: context.language || language,
    intent: context.intent,
    entities,
    summary: [
      context.conversationSummary ? `Previous summary: ${String(context.conversationSummary).slice(0, 2_000)}` : '',
      ...recent.map(item => `${item.role}: ${String(item.content || '').slice(0, 500)}`),
    ].filter(Boolean).join('\n').slice(-maxChars),
    selectedMessages: recent,
    estimatedTokens: Math.ceil(used / 4),
    preferences,
  };
}

export function languageInstruction(language) {
  const labels = { hi: 'Hindi', hinglish: 'natural Hinglish', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', en: 'English' };
  return `Reply in ${labels[language] || language}. If the user changes language, follow their latest language. Preserve business terminology accurately.`;
}

export const BUSINESS_TEMPLATES = Object.freeze({
  rfq: ['Product/service', 'Specifications', 'Quantity and unit', 'Target price', 'Delivery destination/date', 'Packaging', 'Payment terms', 'Required certifications'],
  quotation: ['Buyer requirement', 'Unit and total price', 'MOQ', 'Lead time', 'Incoterm', 'Payment terms', 'Validity', 'Warranty'],
  purchase_order: ['Buyer and supplier', 'Line items', 'Quantities', 'Prices', 'Delivery terms', 'Payment terms', 'Inspection', 'Sign-off'],
  inquiry: ['Business introduction', 'Requirement', 'Specifications', 'Quantity', 'Questions', 'Requested next step'],
  business_proposal: ['Executive summary', 'Problem', 'Solution', 'Commercials', 'Timeline', 'Risks', 'Next steps'],
  negotiation: ['Objective', 'Priorities', 'Trade-offs', 'Proposed terms', 'Fallback position', 'Next step'],
  meeting_request: ['Purpose', 'Agenda', 'Participants', 'Suggested times', 'Preparation'],
  trade_follow_up: ['Context', 'Outstanding items', 'Deadline', 'Requested action'],
  proforma_invoice: ['Seller/buyer', 'Goods', 'HS code', 'Quantity', 'Value', 'Incoterm', 'Payment', 'Validity'],
  export_checklist: ['Classification', 'Buyer checks', 'Compliance', 'Documents', 'Packaging', 'Logistics', 'Customs', 'Payment'],
  import_checklist: ['Classification', 'Supplier checks', 'Landed cost', 'Licences', 'Documents', 'Inspection', 'Customs', 'Delivery'],
});

export function templateInstruction(intent) {
  const template = BUSINESS_TEMPLATES[intent];
  if (!template) return '';
  return `Use the ${intent.replace(/_/g, ' ')} business format with these sections: ${template.join('; ')}. Do not convert it into a generic email.`;
}
