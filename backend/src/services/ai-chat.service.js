import AIService from '../lib/ai-service.js';
import { getAISearchResults, summarizeMarketplaceResults } from '../lib/ai-marketplace-context.js';
import { resolveSmartResponse } from '../lib/smart-intelligence.js';
import AIChatRepository from '../repositories/ai-chat.repository.js';
import AIPlatformContextService from './ai-platform-context.service.js';
import KnowledgeBaseService from './knowledge-base.service.js';
import {
  analyzeRequest,
  buildConversationMemory,
  languageInstruction,
  rewriteSearchQuery,
  templateInstruction,
} from '../lib/ai-intelligence-pipeline.js';
import { buildRepairPrompt, validateAIResponse } from '../lib/ai-response-validator.js';
import LiveSearchService from './live-search.service.js';
import OllamaRuntimeService from './ollama-runtime.service.js';
import { sanitizeAIOutput } from '../lib/ai-output-sanitizer.js';
import AIIntentRouterService from './ai-intent-router.service.js';
import AISemanticCacheService from './ai-semantic-cache.service.js';
import EsyGlobAIGuideService from './esyglob-ai-guide.service.js';
import { config } from '../config/env.js';

class AIChatService {
  static lightweightContext(route = {}) {
    return {
      text: '',
      results: {},
      internal: { memory: { selectedMessages: [] } },
      snapshot: {
        intelligence: { intent: route.intent || 'general', route: route.handling || 'direct', language: 'en' },
        topProducts: [],
        topSuppliers: [],
        navigationActions: [],
        liveSources: [],
      },
    };
  }

  static sanitizeChatForClient(chat) {
    if (!chat) return chat;
    const value = typeof chat.toObject === 'function' ? chat.toObject() : { ...chat };
    value.messages = (value.messages || []).map(message => message.role === 'assistant'
      ? { ...message, content: sanitizeAIOutput(message.content).text || 'I could not safely display this response. Please regenerate it.' }
      : message);
    return value;
  }

  static async warmProvider() {
    return OllamaRuntimeService.warm();
  }
  /**
   * Determine role context
   */
  static getRoleContext(requestedRole, session) {
    const roles = Array.isArray(session?.roles) ? session.roles : [session?.primaryRole].filter(Boolean);
    if (requestedRole === 'admin' && roles.includes('admin')) return 'admin';
    if (requestedRole === 'seller' && roles.includes('seller')) return 'seller';
    if (requestedRole === 'buyer' && (roles.includes('buyer') || !roles.length)) return 'buyer';
    if (roles.includes('seller')) return 'seller';
    if (roles.includes('buyer')) return 'buyer';
    return 'general';
  }

  /**
   * Check if message needs marketplace context
   */
  static needsMarketplaceContext(message = '') {
    const text = message.toLowerCase().trim();
    if (!text) return false;
    if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|who are you|what can you do)[\s.!?]*$/.test(text)) return false;
    const marketplaceNoun = /product|supplier|manufacturer|category|subcategory|factory|service|rfq|quotation|quote|order|certification|variant|specification|trade assurance|shipping|logistics|membership|subscription|plan|payment|refund|dispute|market insight|hs code|import|export|support|help|faq|policy/;
    const discoveryIntent = /find|search|show|recommend|compare|source|sourcing|shortlist|alternative|available|marketplace|explain|what|how|which|open|price|status|track|feature/;
    const accountIntent = /\b(my|our)\b.*\b(rfq|quotation|quote|order|payment|shipment)\b|\b(rfq|quotation|quote|order|payment|shipment)\b.*\b(status|track|manage|history)\b/;
    return (marketplaceNoun.test(text) && discoveryIntent.test(text)) || accountIntent.test(text);
  }

  /**
   * Build platform context for AI
   */
  static async buildPlatformContext(message, role, userId, conversation = {}) {
    const memory = buildConversationMemory({
      messages: conversation.messages || [],
      context: conversation.context || {},
      language: conversation.context?.language || 'en',
    });
    const detectedIntelligence = analyzeRequest({
      message,
      role,
      previousLanguage: memory.language,
    });
    const platformGuide = EsyGlobAIGuideService.contextFor(detectedIntelligence, message);
    const intelligence = {
      ...detectedIntelligence,
      sources: [
        ...detectedIntelligence.sources.filter(source => source !== 'knowledge_base' || config.aiRagEnabled),
        ...(platformGuide ? ['platform_guide'] : []),
      ],
    };
    const rewrittenQuery = rewriteSearchQuery({ message, intelligence, memory });
    const emptyResults = { terms: [], products: [], suppliers: [], manufacturers: [], rfqs: [], quotations: [], orders: [], categories: [], countries: [], services: [] };
    if (['greeting', 'general_knowledge'].includes(intelligence.route)) {
      return {
        results: emptyResults,
        snapshot: { roleContext: role, intelligence, navigationActions: [] },
        internal: { rewrittenQuery, memory },
        text: intelligence.language === 'en' ? '' : languageInstruction(intelligence.language),
      };
    }
    if (intelligence.route === 'live_information') {
      let live = { results: [], available: false };
      try { live = await LiveSearchService.search(message, 3); }
      catch (error) { console.warn('[Live search]', error.message); }
      return {
        results: emptyResults,
        snapshot: { roleContext: role, intelligence, liveSources: live.results, navigationActions: [] },
        internal: { rewrittenQuery, memory },
        text: [
          languageInstruction(intelligence.language),
          'Detected route: live_information. Use only the current sources below. Clearly say when current information could not be verified.',
          ...live.results.map((item, index) => `Source ${index + 1}: ${item.title}\n${item.content}\n${item.url}`),
          !live.available ? 'Live search is not configured, so do not claim current facts or rates.' : '',
        ].filter(Boolean).join('\n\n'),
      };
    }
    const retrievalAllowed = intelligence.sources.some(source =>
      ['products', 'suppliers', 'user_data'].includes(source),
    );
    const derivedFilters = AIService.deriveSearchFilters(message);
    const marketplaceFilters = {
      ...derivedFilters,
      ...(memory.preferences?.verifiedSuppliers ? { requireVerified: true } : {}),
      ...(memory.preferences?.lowMoq ? { lowMoq: true } : {}),
      ...(memory.entities?.country && !(derivedFilters.countries || []).length
        ? { countries: [memory.entities.country] }
        : {}),
    };
    const marketplacePromise = retrievalAllowed && this.needsMarketplaceContext(message)
      ? getAISearchResults({ query: rewrittenQuery, filters: marketplaceFilters, userId })
      : Promise.resolve(emptyResults);
    const knowledgePromise = config.aiRagEnabled && intelligence.sources.includes('knowledge_base')
      ? KnowledgeBaseService.retrieve({
        query: message,
        rewrittenQuery,
        role,
        intent: intelligence.intent,
        language: intelligence.language,
      })
      : Promise.resolve([]);
    const [results, knowledgeDocuments] = await Promise.all([marketplacePromise, knowledgePromise]);
    const knowledge = await AIPlatformContextService.enrich({ message, role, results, userId });
    const knowledgeText = KnowledgeBaseService.format(knowledgeDocuments);

    return {
      results,
      internal: {
        rewrittenQuery,
        memory,
        knowledgeDocumentIds: knowledgeDocuments.map(document => String(document._id)),
      },
      snapshot: {
        roleContext: role,
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
        topOrders: results.orders.slice(0, 3).map(o => ({
          id: o._id, orderNumber: o.orderNumber, status: o.status, paymentStatus: o.paymentStatus,
        })),
        topRfqs: results.rfqs.slice(0, 4).map(r => ({ id: r._id, title: r.title, category: r.category, quantity: r.quantity, unit: r.unit, deliveryCountry: r.deliveryCountry })),
        topQuotations: results.quotations.slice(0, 4).map(q => ({ id: q._id, title: q.rfqId?.title || q.productId?.name || 'Quotation', status: q.status, price: q.unitPrice || q.totalPrice, currency: q.currency })),
        topCategories: results.categories.slice(0, 4).map(c => ({ id: c._id, name: c.name, slug: c.slug })),
        topServices: (knowledge.services.length ? knowledge.services : results.services).slice(0, 6).map(s => ({ key: s.key, title: s.title, description: s.description })),
        plans: knowledge.plans,
        hsCodes: knowledge.hsCodes,
        account: knowledge.account,
        navigationActions: knowledge.navigationActions,
        intelligence,
      },
      text: [
        languageInstruction(intelligence.language),
        `Intent: ${intelligence.intent}. Allowed sources: ${intelligence.sources.join(', ')}.`,
        memory.summary ? `Conversation summary:\n${memory.summary}` : '',
        Object.keys(memory.entities || {}).length ? `Remembered entities and preferences:\n${JSON.stringify({ entities: memory.entities, preferences: memory.preferences })}` : '',
        templateInstruction(intelligence.intent),
        intelligence.requiresPrivateData ? 'Private records are scoped to this user; never infer another user\'s data.' : '',
        platformGuide ? `EsyGlob platform guide:\n${platformGuide}` : '',
        knowledgeText ? `Platform knowledge base:\n${knowledgeText}` : '',
        summarizeMarketplaceResults(results).slice(0, 1900),
        knowledge.text?.slice(0, 1500),
      ].filter(Boolean).join('\n\n'),
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

  static publicMarketplaceSnapshot(snapshot = {}) {
    const {
      intelligence: _intelligence,
      liveSources: _liveSources,
      ...publicSnapshot
    } = snapshot || {};
    return publicSnapshot;
  }

  /**
   * Call Ollama API (non-streaming)
   */
  static async callOllama(prompt, messages = [], systemPrompt = '', options = {}) {
    return OllamaRuntimeService.complete({
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        })),
        { role: 'user', content: prompt },
      ],
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      jsonMode: options.jsonMode,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      contextSize: options.contextSize,
      retry: options.retry,
    });
  }

  // ─── NEW: Dedicated createChat method ──────────────────────────────────

  /**
   * Create a new empty AI chat conversation.
   * Does NOT validate message or generate AI response.
   */
  static async createChat(userId, { title, roleContext, conversationType = 'assistant' } = {}) {
    const supportedConversationTypes = new Set(['assistant', 'search', 'product', 'rfq', 'quotation', 'support']);
    const chat = await AIChatRepository.createChat({
      userId,
      title: title || 'New Conversation',
      roleContext: roleContext || 'general',
      conversationType: supportedConversationTypes.has(conversationType) ? conversationType : 'assistant',
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
      return { chat: this.sanitizeChatForClient(chat) };
    }

    const chats = await AIChatRepository.findUserChats(userId, { role });
    return { chats };
  }

  /**
   * Send message in AI chat (non-streaming)
   */
  static async sendMessage(userId, body, session = {}) {
    const message = body.message?.trim();
    const displayMessage = body.displayMessage?.trim() || message;

    if (!message) {
      throw Object.assign(new Error('Message is required'), { statusCode: 400 });
    }

    const roleContext = this.getRoleContext(body.role, session);
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
      const directText = sanitizeAIOutput(body.directResponse.message).text
        || 'I could not safely display this response. Please try again.';
      const assistantMessage = {
        role: 'assistant',
        content: directText,
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
          message: directText,
          success: true,
          fallback: false,
          tokensUsed: 0,
          provider: 'marketplace',
          model: 'direct-action',
        },
      };
    }

    const requestRoute = AIIntentRouterService.route(message);

    const cached = requestRoute.handling === 'direct' ? null : await AISemanticCacheService.get(message, requestRoute.cacheCategory);
    // Direct and safely cached public answers bypass retrieval and model inference.
    const platformContext = requestRoute.handling === 'direct' || cached
      ? this.lightweightContext(requestRoute)
      : await this.buildPlatformContext(message, roleContext, userId, {
        messages: chat.messages,
        context: { ...(chat.context?.toObject?.() || chat.context || {}), ...(body.context || {}) },
      });

    // Build system prompt
    const systemPrompt = AIService.buildMarketplaceSystemPrompt(
      roleContext,
      `${platformContext.text}${this.formatSupportContext(body.context)}`,
      platformContext.snapshot.intelligence,
    );

    let aiResult = requestRoute.handling === 'direct'
      ? { success: true, message: requestRoute.response, tokensUsed: 0, provider: 'marketplace', model: null, fallback: false }
      : cached
        ? { success: true, message: cached.response, tokensUsed: 0, provider: 'semantic_cache', model: null, fallback: false }
        : await this.callOllama(message, platformContext.internal?.memory?.selectedMessages || chat.messages.slice(-20), systemPrompt);

    const intelligence = platformContext.snapshot.intelligence || {};
    let finalResponse = String(aiResult.message || '').trim();
    let validation = validateAIResponse({ message, response: finalResponse, intelligence, snapshot: platformContext.snapshot });
    let regenerated = false;
    if (!validation.passed) {
      try {
        const repair = await this.callOllama(
          buildRepairPrompt({ message, response: finalResponse, validation, intelligence }),
          chat.messages.slice(-7),
          systemPrompt,
          { maxTokens: Number(process.env.AI_CHAT_MAX_TOKENS || 520), temperature: 0.2 },
        );
        const repairedText = String(repair.message || '').trim();
        const repairedValidation = validateAIResponse({ message, response: repairedText, intelligence, snapshot: platformContext.snapshot });
        regenerated = true;
        if (repairedValidation.passed) {
          finalResponse = repairedText;
          validation = repairedValidation;
          aiResult = { ...aiResult, provider: repair.provider, model: repair.model, tokensUsed: Number(aiResult.tokensUsed || 0) + Number(repair.tokensUsed || 0) };
        } else validation = repairedValidation;
      } catch (error) {
        console.warn('[AI validator] Regeneration failed:', error.message);
      }
    }
    if (!validation.passed && validation.issues.some(issue => issue.severity === 'critical')) {
      finalResponse = 'I could not produce a safe, verified response. Please rephrase the request without private information.';
    }
    if (!cached && requestRoute.handling !== 'direct' && validation.passed && requestRoute.cacheCategory) {
      AISemanticCacheService.put(message, finalResponse, requestRoute.cacheCategory).catch(() => undefined);
    }

    const suggestions = this.buildSuggestedFollowUps({ message, role: roleContext, snapshot: platformContext.snapshot });
    const marketplaceMetadata = {
      suggestions,
      topProducts: platformContext.snapshot.topProducts || [],
      topSuppliers: platformContext.snapshot.topSuppliers || [],
      navigationActions: platformContext.snapshot.navigationActions || [],
    };

    // Build assistant message
    const assistantMessage = {
      role: 'assistant',
      content: finalResponse || 'I could not generate a response. Please try again.',
      tokens: aiResult.tokensUsed || 0,
      timestamp: new Date(),
      metadata: {
        fallback: aiResult.fallback,
        provider: aiResult.provider || 'ai',
        model: aiResult.model || 'default',
        card: body.responseCard || undefined,
        validation: { passed: validation.passed, regenerated, issues: validation.issues.map(issue => issue.code) },
        ...marketplaceMetadata,
      },
    };

    // Context updates
    const contextUpdates = {
      'context.lastQuery': message,
      'context.rewrittenQuery': platformContext.internal?.rewrittenQuery,
      'context.language': platformContext.snapshot.intelligence?.language,
      'context.intent': platformContext.snapshot.intelligence?.intent,
      'context.conversationSummary': platformContext.internal?.memory?.summary,
      'context.entities': platformContext.internal?.memory?.entities,
      'context.preferences': platformContext.internal?.memory?.preferences,
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
        message: finalResponse,
        success: aiResult.success,
        fallback: aiResult.fallback,
        tokensUsed: aiResult.tokensUsed,
        provider: aiResult.provider,
        model: aiResult.model,
        metadata: marketplaceMetadata,
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
