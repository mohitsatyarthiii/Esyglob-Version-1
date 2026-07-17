import AIService from '../lib/ai-service.js';
import { getAISearchResults, summarizeMarketplaceResults } from '../lib/ai-marketplace-context.js';
import { resolveSmartResponse } from '../lib/smart-intelligence.js';
import AIChatRepository from '../repositories/ai-chat.repository.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ai.esyglob.in';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const OLLAMA_ENABLED = process.env.OLLAMA_ENABLED !== 'false';

class AIChatService {
  static async warmProvider() {
    if (!OLLAMA_ENABLED) return false;
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(Number(process.env.OLLAMA_WARMUP_TIMEOUT_MS || 90000)),
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [{ role: 'user', content: 'Respond with OK.' }],
          stream: false,
          keep_alive: process.env.OLLAMA_KEEP_ALIVE || '60m',
          options: { num_predict: 2, temperature: 0 },
        }),
      });
      return response.ok;
    } catch (error) {
      console.warn('[Ollama] Warm-up failed:', error.message);
      return false;
    }
  }
  /**
   * Determine role context
   */
  static getRoleContext(requestedRole, session) {
    if (['buyer', 'seller', 'admin', 'general'].includes(requestedRole)) return requestedRole;
    if (session?.roles?.includes('seller')) return 'seller';
    if (session?.roles?.includes('buyer')) return 'buyer';
    return 'general';
  }

  /**
   * Check if message needs marketplace context
   */
  static needsMarketplaceContext(message = '') {
    const text = message.toLowerCase().trim();
    if (!text) return false;
    if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|who are you|what can you do)[\s.!?]*$/.test(text)) return false;
    const marketplaceNoun = /product|supplier|manufacturer|category|factory|service|rfq|quotation|quote|order/;
    const discoveryIntent = /find|search|show|recommend|compare|source|sourcing|shortlist|alternative|available|marketplace/;
    const accountIntent = /\b(my|our)\b.*\b(rfq|quotation|quote|order|payment|shipment)\b|\b(rfq|quotation|quote|order|payment|shipment)\b.*\b(status|track|manage|history)\b/;
    return (marketplaceNoun.test(text) && discoveryIntent.test(text)) || accountIntent.test(text);
  }

  /**
   * Build platform context for AI
   */
  static async buildPlatformContext(message, role, userId) {
    if (!this.needsMarketplaceContext(message)) {
      return {
        snapshot: { terms: [], productCount: 0, supplierCount: 0, rfqCount: 0, quotationCount: 0, topProducts: [], topSuppliers: [], topRfqs: [] },
        text: `${role} assistant context: no marketplace lookup needed.`,
        results: { terms: [], products: [], suppliers: [], rfqs: [], quotations: [], orders: [], categories: [], countries: [], services: [] },
      };
    }

    const filters = AIService.deriveSearchFilters(message);
    const results = await getAISearchResults({ query: message, filters, userId });

    return {
      results,
      snapshot: {
        terms: results.terms,
        productCount: results.products.length,
        supplierCount: results.suppliers.length,
        categoryCount: results.categories.length,
        countryCount: results.countries.length,
        serviceCount: results.services.length,
        rfqCount: results.rfqs.length,
        quotationCount: results.quotations.length,
        orderCount: results.orders.length,
        topProducts: results.products.slice(0, 4).map(p => ({
          id: p._id, name: p.name, category: p.category, price: p.price,
          currency: p.currency, moq: p.minimumOrderQuantity, unit: p.unit,
          image: p.images?.[0], rating: p.averageRating, leadTime: p.leadTime,
          link: `/products/${p._id}`,
          supplier: p.sellerId?.companyName,
          supplierVerified: p.sellerId?.isVerified,
          supplierLink: p.sellerId?._id ? `/manufacturers/${p.sellerId._id}` : null,
        })),
        topSuppliers: results.suppliers.slice(0, 4).map(s => ({
          id: s._id, companyName: s.companyName, companyType: s.companyType,
          verified: s.isVerified, country: s.address?.country, trustScore: s.trustScore,
          rating: s.rating,
          link: `/manufacturers/${s._id}`,
        })),
        topCategories: results.categories.slice(0, 4).map(c => ({
          id: c._id, name: c.name, link: `/categories/${encodeURIComponent(c.slug || c.name)}`,
        })),
        topRfqs: results.rfqs.slice(0, 3).map(r => ({
          id: r._id, title: r.title, category: r.category, quantity: r.quantity,
          deliveryCountry: r.deliveryCountry,
        })),
        topOrders: results.orders.slice(0, 3).map(o => ({
          id: o._id, orderNumber: o.orderNumber, status: o.status, paymentStatus: o.paymentStatus,
        })),
      },
      text: `${role} assistant context:\n${summarizeMarketplaceResults(results)}`,
    };
  }

  /**
   * Infer issue type from message
   */
  static inferIssueType(message = '') {
    const text = message.toLowerCase();
    if (/login|password|sign in|signin|otp|access/.test(text)) return 'login';
    if (/verify|verification|document|kyc|approved|rejected/.test(text)) return 'verification';
    if (/onboarding|business setup|factory profile/.test(text)) return 'seller_onboarding';
    if (/supplier|manufacturer|fraud|report supplier/.test(text)) return 'supplier';
    if (/product|listing|report product|fake product/.test(text)) return 'product';
    if (/order|sample|delivered|cancel|refund/.test(text)) return 'order';
    if (/payment|paid|invoice|escrow|transaction/.test(text)) return 'payment';
    if (/ship|shipping|tracking|logistics|customs/.test(text)) return 'shipping';
    if (/complaint|complain|report|issue|problem|support/.test(text)) return 'complaint';
    if (/account/.test(text)) return 'account';
    if (/service/.test(text)) return 'service';
    return 'other';
  }

  /**
   * Infer priority from message
   */
  static inferPriority(message = '') {
    const text = message.toLowerCase();
    if (/fraud|scam|unsafe|urgent|legal|stolen|threat|chargeback/.test(text)) return 'urgent';
    if (/refund|payment|not delivered|wrong item|fake/.test(text)) return 'high';
    return 'medium';
  }

  /**
   * Format support context
   */
  static formatSupportContext(context = {}) {
    if (!context || typeof context !== 'object') return '';
    const parts = [
      context.feature ? `Current feature: ${context.feature}` : null,
      context.sourcePath ? `Current page: ${context.sourcePath}` : null,
    ].filter(Boolean);
    return parts.length ? `\nSupport context:\n${parts.join('\n')}` : '';
  }

  static buildSuggestedFollowUps({ message = '', role = 'general', snapshot = {} } = {}) {
    const text = message.toLowerCase();
    const suggestions = [];
    if (snapshot.productCount) suggestions.push('Compare the best matching products by MOQ, price, and supplier trust');
    if (snapshot.supplierCount) suggestions.push('Show only verified suppliers and explain the safest shortlist');
    if (/rfq|source|buy|product|supplier/.test(text)) suggestions.push('Draft a professional RFQ with specifications and trade terms');
    if (role === 'seller' || /quotation|quote/.test(text)) suggestions.push('Prepare a quotation with MOQ, lead time, packaging, and payment terms');
    if (/import|export|ship|custom|tariff|logistic/.test(text)) suggestions.push('Explain the documents, Incoterms, costs, and compliance risks');
    suggestions.push(role === 'seller' ? 'What should I improve to win more buyer enquiries?' : 'What due-diligence checks should I complete before ordering?');
    return [...new Set(suggestions)].slice(0, 3);
  }

  /**
   * Call Ollama API (non-streaming)
   */
  static async callOllama(prompt, messages = [], systemPrompt = '', options = {}) {
    if (!OLLAMA_ENABLED) {
      throw new Error('Ollama is disabled');
    }

    try {
      const ollamaMessages = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        })),
        { role: 'user', content: prompt },
      ];

      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS || 90000)),
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          keep_alive: process.env.OLLAMA_KEEP_ALIVE || '60m',
          messages: ollamaMessages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.35,
            top_p: 0.9,
            num_predict: options.maxTokens || 520,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API returned ${response.status}${response.status === 504 ? ' (gateway timeout)' : ''}`);
      }

      const data = await response.json();

      return {
        success: true,
        message: data.message?.content || data.response || 'No response from Ollama',
        tokensUsed: data.eval_count || 0,
        provider: 'ollama',
        model: OLLAMA_MODEL,
        fallback: false,
      };
    } catch (error) {
      console.error('[Ollama] Error:', error);
      throw error;
    }
  }

  // ─── NEW: Dedicated createChat method ──────────────────────────────────

  /**
   * Create a new empty AI chat conversation.
   * Does NOT validate message or generate AI response.
   */
  static async createChat(userId, { title, roleContext, conversationType = 'assistant' } = {}) {
    const chat = await AIChatRepository.createChat({
      userId,
      title: title || 'New Conversation',
      roleContext: roleContext || 'general',
      conversationType,
      messages: [],
      context: {},
    });
    return { chat };
  }

  // ───────────────────────────────────────────────────────────────────────

  /**
   * Get user's AI chats
   */
  static async getUserChats(userId, { chatId, role } = {}) {
    if (chatId) {
      const chat = await AIChatRepository.findByIdLean(chatId);
      if (!chat || chat.userId.toString() !== userId.toString()) {
        throw Object.assign(new Error('Chat not found'), { statusCode: 404 });
      }
      return { chat };
    }

    const chats = await AIChatRepository.findUserChats(userId, { role });
    return { chats };
  }

  /**
   * Send message in AI chat (non-streaming)
   */
  static async sendMessage(userId, body) {
    const message = body.message?.trim();
    const displayMessage = body.displayMessage?.trim() || message;

    if (!message) {
      throw Object.assign(new Error('Message is required'), { statusCode: 400 });
    }

    const roleContext = this.getRoleContext(body.role, body);
    let chat;

    // Find or create chat
    if (body.chatId) {
      chat = await AIChatRepository.findByUserAndId(body.chatId, userId);
      if (!chat) throw Object.assign(new Error('Chat not found'), { statusCode: 404 });
    } else {
      chat = await AIChatRepository.createChat({
        userId,
        title: message.substring(0, 70),
        roleContext,
        conversationType: body.conversationType || 'assistant',
        messages: [],
        context: {},
      });
    }

    // Build user message
    const userMessage = {
      role: 'user',
      content: displayMessage,
      timestamp: new Date(),
      metadata: body.pluginPayload
        ? { pluginPayload: body.pluginPayload, pluginId: body.pluginPayload.pluginId }
        : undefined,
    };

    // Handle direct response (no AI needed)
    if (body.directResponse?.message) {
      const assistantMessage = {
        role: 'assistant',
        content: body.directResponse.message,
        tokens: 0,
        timestamp: new Date(),
        metadata: {
          provider: 'marketplace',
          model: 'direct-action',
          card: body.responseCard || undefined,
          directAction: true,
        },
      };

      const contextUpdates = {
        'context.lastQuery': message,
        'context.supportMode': Boolean(body.supportMode),
        ...(body.context?.sourcePath && { 'context.sourcePath': body.context.sourcePath }),
        ...(body.context?.feature && { 'context.feature': body.context.feature }),
      };

      await AIChatRepository.updateChatAfterResponse(chat._id, userId, {
        userMessage,
        assistantMessage,
        provider: 'marketplace',
        model: 'direct-action',
        tokensUsed: 0,
        contextUpdates,
      });

      const updatedChat = await AIChatRepository.findById(chat._id);
      return {
        chat: updatedChat,
        response: {
          message: body.directResponse.message,
          success: true,
          fallback: false,
          tokensUsed: 0,
          provider: 'marketplace',
          model: 'direct-action',
        },
      };
    }

    // Build platform context
    const platformContext = await this.buildPlatformContext(message, roleContext, userId);

    // Build system prompt
    const systemPrompt = AIService.buildMarketplaceSystemPrompt(
      roleContext,
      `${platformContext.text}${this.formatSupportContext(body.context)}`
    );

    // Try Ollama first, fallback to AIService
    let aiResult;
    try {
      aiResult = await this.callOllama(message, chat.messages.slice(-7), systemPrompt);
    } catch (ollamaError) {
      aiResult = await AIService.chat(message, chat.messages.slice(-7), systemPrompt, {
        role: roleContext,
        platformContext: platformContext.text,
      });
    }

    // Build assistant message
    const assistantMessage = {
      role: 'assistant',
      content: aiResult.message || 'I could not generate a response. Please try again.',
      tokens: aiResult.tokensUsed || 0,
      timestamp: new Date(),
      metadata: {
        fallback: aiResult.fallback,
        provider: aiResult.provider || 'ai',
        model: aiResult.model || 'default',
        card: body.responseCard || undefined,
      },
    };

    // Context updates
    const contextUpdates = {
      'context.lastQuery': message,
      'context.marketplaceSnapshot': platformContext.snapshot,
      'context.supportMode': Boolean(body.supportMode),
      ...(body.context?.sourcePath && { 'context.sourcePath': body.context.sourcePath }),
      ...(body.context?.feature && { 'context.feature': body.context.feature }),
      ...(body.pluginPayload && { 'context.pluginPayload': body.pluginPayload }),
    };

    // Update chat
    await AIChatRepository.updateChatAfterResponse(chat._id, userId, {
      userMessage,
      assistantMessage,
      provider: aiResult.provider || 'ai',
      model: aiResult.model || 'default',
      tokensUsed: aiResult.tokensUsed || 0,
      contextUpdates,
    });

    // Create support ticket if requested
    let supportTicket = null;
    if (body.createSupportTicket) {
      supportTicket = await AIChatRepository.createSupportTicket({
        userId,
        roleContext,
        issueType: body.issueType || this.inferIssueType(message),
        subject: body.ticketSubject || message.slice(0, 120),
        description: body.ticketDescription || message,
        priority: body.priority || this.inferPriority(message),
        aiChatId: chat._id,
        source: 'ai_support',
        metadata: {
          marketplaceSnapshot: platformContext.snapshot,
          userRole: roleContext,
        },
      });
    }

    const updatedChat = await AIChatRepository.findById(chat._id);
    return {
      chat: updatedChat,
      response: {
        message: aiResult.message,
        success: aiResult.success,
        fallback: aiResult.fallback,
        tokensUsed: aiResult.tokensUsed,
        provider: aiResult.provider,
        model: aiResult.model,
      },
      supportTicket,
    };
  }

  /**
   * Update AI chat (title or status)
   */
  static async updateChat(userId, body) {
    if (!body.chatId) {
      throw Object.assign(new Error('chatId is required'), { statusCode: 400 });
    }

    const chat = await AIChatRepository.findByUserAndId(body.chatId, userId);
    if (!chat) throw Object.assign(new Error('Chat not found'), { statusCode: 404 });

    if (body.title !== undefined) {
      chat.title = String(body.title).trim().slice(0, 90) || chat.title;
    }
    if (body.status && ['active', 'archived'].includes(body.status)) {
      chat.status = body.status;
    }

    await chat.save();
    return { chat };
  }

  /**
   * Archive AI chat
   */
  static async archiveChat(userId, chatId) {
    if (!chatId) {
      throw Object.assign(new Error('chatId is required'), { statusCode: 400 });
    }

    const chat = await AIChatRepository.archiveChat(chatId, userId);
    if (!chat) throw Object.assign(new Error('Chat not found'), { statusCode: 404 });

    return { success: true };
  }

  /**
   * Resolve smart response for streaming
   */
  static resolveSmartResponse({ message, role, results, forceAI }) {
    return resolveSmartResponse({ message, results, forceAI });
  }
}

export default AIChatService;
