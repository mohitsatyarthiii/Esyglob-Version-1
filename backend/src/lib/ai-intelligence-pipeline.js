const INTENTS = [
  ['supplier_search', /supplier|manufacturer|factory/i],
  ['product_search', /(find|search|source|compare).*product|product.*(search|supplier|alternative)/i],
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
  const liveInformation = /\b(current|today|latest|right now|live|202[5-9])\b.*\b(duty|tariff|rate|regulation|news|price|statistics)|\b(duty|tariff|regulation)\b.*\b(current|today|latest|live)\b/i.test(message);
  const platformIntent = ['rfq', 'quotation', 'order', 'shipping', 'trade_assurance', 'payment', 'membership', 'policy', 'platform_help', 'hs_code', 'market_research'].includes(intent);
  const route = greeting ? 'greeting'
    : requiresPrivateData ? 'private_data'
    : liveInformation ? 'live_information'
    : ['product_search', 'supplier_search'].includes(intent) ? 'marketplace_data'
    : platformIntent ? 'platform_knowledge'
    : 'general_knowledge';
  const sources = intent === 'product_search' ? ['products', 'suppliers']
    : intent === 'supplier_search' ? ['suppliers', 'products']
    : intent === 'hs_code' ? ['hs_codes', 'knowledge_base']
    : requiresPrivateData ? ['user_data', 'knowledge_base']
    : route === 'greeting' || route === 'general_knowledge' ? ['model_knowledge']
    : route === 'live_information' ? ['live_search']
    : ['knowledge_base'];
  return { intent, language, role, route, requiresPrivateData, sources, classifiedAt: Date.now() };
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
