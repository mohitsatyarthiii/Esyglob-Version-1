import AIService from '../lib/ai-service.js';
import AISearchRepository from '../repositories/ai-search.repository.js';
import { resolveSmartResponse } from '../lib/smart-intelligence.js';
import { summarizeMarketplaceResults } from '../lib/ai-marketplace-context.js';
import { imageSourceMetadata, logImageSearch } from '../lib/image-search-logger.js';

class AISearchService {
  /**
   * Build search answer text
   */
  static buildSearchAnswer(query, results, filters, aiText = '') {
    if (aiText) return aiText;

    const total = (results.products?.length || 0) + (results.suppliers?.length || 0) + (results.rfqs?.length || 0);
    if (!total) {
      return `I could not find strong marketplace matches for "${query}". Try broader category terms, search by country, or create an RFQ so suppliers can quote directly.`;
    }

    const parts = [];
    if (results.products?.length) parts.push(`${results.products.length} product matches`);
    if (results.suppliers?.length) parts.push(`${results.suppliers.length} supplier profiles`);
    if (results.rfqs?.length) parts.push(`${results.rfqs.length} active RFQ opportunities`);
    if (results.quotations?.length) parts.push(`${results.quotations.length} related quotations`);

    const summary = filters?.summary || `I searched EsyGlob for "${query}"`;
    return `${summary}. I found ${parts.join(', ')}. Review verified suppliers first, compare MOQ and lead time, and use RFQ or messaging when you need bulk pricing.`;
  }

  /**
   * Execute AI-powered marketplace search
   */
  static async search({
    query,
    imageUrl,
    role = 'general',
    includeAI = true,
    forceAI = false,
    userId = null,
    requestId = '',
  }) {
    if (!query && !imageUrl) {
      throw Object.assign(new Error('Query is required'), { statusCode: 400 });
    }

    let visualAnalysis = null;
    if (imageUrl) {
      const aiStartedAt = Date.now();
      logImageSearch('info', 'ai_analysis_started', {
        requestId,
        ...imageSourceMetadata(imageUrl),
      });
      visualAnalysis = await AIService.analyzeMarketplaceImage(imageUrl, { requestId });
      logImageSearch(visualAnalysis.success ? 'info' : 'error', 'ai_analysis_completed', {
        requestId,
        success: visualAnalysis.success,
        provider: visualAnalysis.provider,
        model: visualAnalysis.model,
        durationMs: Date.now() - aiStartedAt,
        confidence: visualAnalysis.analysis?.confidence || 0,
        attempts: visualAnalysis.attempts,
      });
      if (!visualAnalysis.success) {
        throw Object.assign(new Error('The vision service could not analyze this image'), {
          statusCode: 503,
          code: 'IMAGE_ANALYSIS_UNAVAILABLE',
          stage: 'ai_analysis',
          retryable: true,
        });
      }
    }
    const effectiveQuery = visualAnalysis?.success
      ? [
        visualAnalysis.analysis?.productName,
        visualAnalysis.analysis?.category,
        visualAnalysis.analysis?.subcategory,
        visualAnalysis.analysis?.material,
        ...(visualAnalysis.analysis?.keywords || []),
        ...(visualAnalysis.analysis?.alternateKeywords || []),
        query,
      ].filter(Boolean).join(' ')
      : query;

    // Derive search filters
    const filters = AIService.deriveSearchFilters(effectiveQuery || '');

    if (imageUrl) {
      const searchStartedAt = Date.now();
      logImageSearch('info', 'database_search_started', {
        requestId,
        confidence: visualAnalysis.analysis.confidence,
        productName: visualAnalysis.analysis.productName,
        category: visualAnalysis.analysis.category,
        subcategory: visualAnalysis.analysis.subcategory,
        industry: visualAnalysis.analysis.industry,
        material: visualAnalysis.analysis.material,
        keywords: visualAnalysis.analysis.keywords,
        alternateKeywords: visualAnalysis.analysis.alternateKeywords,
      });
      const results = await AISearchRepository.searchVisualMarketplace({
        analysis: visualAnalysis?.analysis,
        userQuery: query || '',
        userId,
        requestId,
      });
      logImageSearch('info', 'database_search_completed', {
        requestId,
        durationMs: Date.now() - searchStartedAt,
        productCount: results.products.length,
        sellerCount: results.suppliers.length,
        categoryCount: results.categories.length,
        candidateCount: results.diagnostics?.candidateCount,
        retrievalMode: results.diagnostics?.retrievalMode,
      });
      const productCount = results.products.length;
      const supplierCount = results.suppliers.length;
      const answer = productCount
        ? `Found ${productCount} relevant product ${productCount === 1 ? 'match' : 'matches'}${supplierCount ? ` from ${supplierCount} matching ${supplierCount === 1 ? 'supplier' : 'suppliers'}` : ''}.`
        : visualAnalysis?.success
          ? 'No close catalog match is currently available. Try another angle or a clearer product photo.'
          : 'The image could not be identified reliably. Try a clearer photo with one product centered.';
      return {
        answer,
        aiEnhanced: Boolean(visualAnalysis?.success),
        provider: visualAnalysis?.provider || 'none',
        model: visualAnalysis?.model || 'unavailable',
        filters,
        intent: 'product_search',
        results,
        products: results.products,
        sellers: results.suppliers,
        suppliers: results.suppliers,
        manufacturers: results.manufacturers,
        categories: results.categories,
        services: [],
        rfqs: [],
        quotations: [],
        imageSearch: {
          imageUrl,
          status: visualAnalysis?.success ? 'analyzed' : 'analysis_unavailable',
          confidence: visualAnalysis?.analysis?.confidence || 0,
        },
        suggestions: productCount
          ? ['Compare verified suppliers', 'Open matching product pages', 'Create an RFQ for bulk pricing']
          : ['Use a clear product photo', 'Center one object in the frame', 'Add a short product description'],
        tokensUsed: visualAnalysis?.tokensUsed || 0,
      };
    }

    // Get marketplace results
    const results = await AISearchRepository.searchMarketplace({
      query: effectiveQuery,
      filters,
      userId,
    });

    const terms = results.terms || [];

    // Get categories and services in parallel
    const [categories, services] = await Promise.all([
      AISearchRepository.searchCategories(terms),
      Promise.resolve(AISearchRepository.searchServices(terms)),
    ]);

    results.categories = categories;
    results.services = services;

    // Check for smart/deterministic response
    const smartResponse = resolveSmartResponse({
      message: query,
      role,
      results,
      forceAI: Boolean(forceAI || imageUrl),
    });

    // Return without AI if not needed
    if (!includeAI || (!smartResponse.shouldUseAI && smartResponse.response)) {
      return {
        answer: this.buildSearchAnswer(query, results, filters, smartResponse.response || ''),
        aiEnhanced: false,
        provider: includeAI ? smartResponse.source : 'database-first',
        model: includeAI ? 'smart-intelligence' : 'marketplace-index',
        filters,
        intent: filters.intent || 'mixed',
        results,
        products: results.products,
        sellers: results.suppliers,
        suppliers: results.suppliers,
        manufacturers: results.manufacturers,
        categories: results.categories,
        services: results.services,
        rfqs: results.rfqs,
        quotations: results.quotations,
        imageSearch: imageUrl
          ? { imageUrl, status: visualAnalysis?.success ? 'analyzed' : 'text_fallback', analysis: visualAnalysis?.content || '' }
          : null,
        suggestions: [
          'Compare verified suppliers',
          'Create an RFQ for bulk pricing',
          'Open matching product pages',
          'Message suppliers with your specifications',
        ],
        tokensUsed: 0,
      };
    }

    // Build AI-enhanced response
    const contextSummary = summarizeMarketplaceResults({
      ...results,
      products: (results.products || []).slice(0, 8),
      suppliers: (results.suppliers || []).slice(0, 8),
      categories: (results.categories || []).slice(0, 6),
      services: (results.services || []).slice(0, 4),
      rfqs: (results.rfqs || []).slice(0, 3),
      quotations: (results.quotations || []).slice(0, 3),
    });

    const answerPrompt = `${AIService.buildMarketplaceSystemPrompt(role, contextSummary)}

Write a concise marketplace search response for this EsyGlob query.
Query: ${query}
Image search: ${imageUrl ? `The uploaded image was analyzed as: ${visualAnalysis?.content || 'visual analysis unavailable; use the user query only'}.` : 'No uploaded image.'}
AI interpretation: ${JSON.stringify(filters)}
Marketplace result summary:
${contextSummary}

Instructions:
- Use only the marketplace result summary for product, supplier, RFQ, quotation, category, and service names.
- If no relevant result is available, say that clearly and suggest broader search terms or creating an RFQ.
- Match the user's language.
- Mention useful next actions for sourcing, supplier comparison, RFQs, image search, category browsing, services, or quotation review.
- Do not mention APIs, models, prompts, databases, or internal routing.`;

    const answerResult = await AIService.generateText(answerPrompt, {
      purpose: 'SEARCH',
      temperature: 0.35,
      maxTokens: Number(process.env.AI_SEARCH_MAX_TOKENS || 220),
      timeout: Math.min(Number(process.env.AI_SEARCH_TIMEOUT || 8000), 12000),
      cache: true,
    });

    const tokensUsed = answerResult.tokensUsed || 0;

    return {
      answer: this.buildSearchAnswer(query, results, filters, answerResult.success ? answerResult.content : ''),
      aiEnhanced: Boolean(answerResult.success),
      provider: answerResult.provider || AIService.getConfig().provider,
      model: answerResult.model || AIService.getConfig().model,
      filters,
      intent: filters.intent || 'mixed',
      results,
      products: results.products,
      sellers: results.suppliers,
      suppliers: results.suppliers,
      manufacturers: results.manufacturers,
      categories: results.categories,
      services: results.services,
      rfqs: results.rfqs,
      quotations: results.quotations,
      imageSearch: imageUrl
        ? { imageUrl, status: visualAnalysis?.success ? 'analyzed' : 'text_fallback', analysis: visualAnalysis?.content || '' }
        : null,
      suggestions: [
        'Compare verified suppliers',
        'Create an RFQ for bulk pricing',
        'Ask AI to shortlist by MOQ and lead time',
        'Search again with a product image',
        'Message suppliers with your specifications',
      ],
      tokensUsed,
    };
  }
}

export default AISearchService;
