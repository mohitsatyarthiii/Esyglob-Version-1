const STATIC_RESPONSES = [
  { intent: 'greeting', pattern: /^(?:hi|hello|namaste|good (?:morning|afternoon|evening))[!. ]*$/i, response: 'Hi! 👋 How can I help you with EsyGlob today?' },
  { intent: 'greeting', pattern: /^hey[!. ]*$/i, response: 'Hey! 👋 What can I help you find on EsyGlob?' },
  { intent: 'thanks', pattern: /^(?:thanks|thank you|thank you so much|shukriya)[!. ]*$/i, response: 'You’re welcome! Let me know if you need help with EsyGlob, products, suppliers, sourcing, or trade.' },
  { intent: 'goodbye', pattern: /^(?:bye|goodbye|see you|talk later)[!. ]*$/i, response: 'Goodbye! I’m here whenever you need help with EsyGlob, sourcing, or trade.' },
  { intent: 'faq_esyglob', pattern: /^(?:what is|tell me about|explain)\s+esyglob[?.! ]*$/i, response: 'EsyGlob is a B2B marketplace that connects buyers with manufacturers and suppliers, helping businesses discover products, contact sellers, request quotations and manage trade-related activities.' },
  { intent: 'faq_moq', pattern: /^(?:what is|what does|define|explain)\s+(?:an?\s+)?moq(?:\s+mean)?[?.! ]*$/i, response: 'MOQ means Minimum Order Quantity—the smallest quantity a supplier is willing to sell in one order. It can vary by product, customization, packaging and supplier.' },
  { intent: 'faq_rfq', pattern: /^(?:what is|what does|define|explain)\s+(?:an?\s+)?rfq(?:\s+mean)?[?.! ]*$/i, response: 'RFQ means Request for Quotation. A buyer sends an RFQ to suppliers with product specifications, quantity, destination and commercial requirements so they can provide comparable quotations.' },
  { intent: 'acknowledgement', pattern: /^(?:ok|okay|got it|theek hai|thik hai)[!. ]*$/i, response: 'Got it. What would you like help with next?' },
];

export default class AIIntentRouterService {
  static route(message = '') {
    const normalized = String(message).trim();
    const direct = STATIC_RESPONSES.find(item => item.pattern.test(normalized));
    if (direct) return { intent: direct.intent, handling: 'direct', response: direct.response, cacheCategory: 'static_faq' };
    if (/\b(market report|market insights?|industry analysis|competitor analysis|price trends?|forecast)\b/i.test(normalized)) return { intent: 'market_insights', handling: 'ai_market_insights' };
    if (/\b(latest|current|today|live|202[4-9])\b/i.test(normalized)) return { intent: 'time_sensitive', handling: 'live_retrieval' };
    if (/\b(products?|suppliers?|manufacturers?|categories|marketplace|source|sourcing)\b/i.test(normalized)) return { intent: 'marketplace_lookup', handling: 'database_first' };
    if (/\b(import|export|incoterms?|customs|duty|tariff|compliance|shipping|trade)\b/i.test(normalized)) return { intent: 'trade_guidance', handling: 'ai_trade', cacheCategory: 'stable_trade' };
    return { intent: 'general', handling: 'ai_general', cacheCategory: 'stable_general' };
  }
}
