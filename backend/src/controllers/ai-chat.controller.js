import AIChatService from '../services/ai-chat.service.js';
import AIChatRepository from '../repositories/ai-chat.repository.js';
import AIService from '../lib/ai-service.js';
import mongoose from 'mongoose';
import OllamaRuntimeService from '../services/ollama-runtime.service.js';
import AIIntentRouterService from '../services/ai-intent-router.service.js';
import AISemanticCacheService from '../services/ai-semantic-cache.service.js';
import { sanitizeAIOutput } from '../lib/ai-output-sanitizer.js';
import EsyGlobAIGuideService from '../services/esyglob-ai-guide.service.js';
import { commitUsageReservation, releaseUsageReservation } from '../lib/subscription-access.js';

const CHAT_MAX_TOKENS = Number(process.env.AI_CHAT_MAX_TOKENS || 520);

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function debugLog(...args) {
  if (process.env.AI_DEBUG === 'true') console.log(...args);
}

function inferenceBudget(route = {}, intelligence = {}, message = '') {
  const handling = route.handling || '';
  if (handling === 'ai_market_insights' || intelligence.intent === 'market_research') return { maxTokens: Math.min(CHAT_MAX_TOKENS, 280), contextSize: 3_072 };
  if (handling === 'database_first' || intelligence.route === 'marketplace_data') return { maxTokens: Math.min(CHAT_MAX_TOKENS, 420), contextSize: 3_072 };
  if (handling === 'ai_trade' || intelligence.route === 'knowledge_data') return { maxTokens: Math.min(CHAT_MAX_TOKENS, 420), contextSize: 3_072 };
  return { maxTokens: Math.min(CHAT_MAX_TOKENS, String(message).length < 120 ? 220 : 320), contextSize: 2_048 };
}

class AIChatController {
  /**
   * GET - Fetch AI chats
   */
  static async getChats(req, res) {
    try {
      const { chatId, role } = req.query;
      const result = await AIChatService.getUserChats(req.user._id, { chatId, role });
      return res.json(result);
    } catch (error) {
      console.error('[AI-Chat-GET] Error:', error);
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to fetch chats' });
    }
  }

  /**
   * POST - Send message (non-streaming)
   */
  static async sendMessage(req, res) {
    try {
      const result = await AIChatService.sendMessage(req.user._id, req.body, req.user, req.aiRouting);
      const credits = await commitUsageReservation(req, { responseTokens: result.tokensUsed });
      return res.json({ ...result, credits });
    } catch (error) {
      await releaseUsageReservation(req, error).catch(() => undefined);
      console.error('[AI-Chat-POST] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(error.statusCode === 503 ? 503 : 500).json({
        error: error.statusCode === 503
          ? 'EsyGlob AI is temporarily unavailable. Please retry in a moment.'
          : 'The AI response could not be completed. Please retry.',
        code: error.code || 'AI_REQUEST_FAILED',
      });
    }
  }

  /**
   * PATCH - Update AI chat
   */
  static async updateChat(req, res) {
    try {
      const result = await AIChatService.updateChat(req.user._id, req.body);
      return res.json(result);
    } catch (error) {
      console.error('[AI-Chat-PATCH] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to update chat' });
    }
  }

  /**
   * DELETE - Archive AI chat
   */
  static async archiveChat(req, res) {
    try {
      const { chatId } = req.query;
      const result = await AIChatService.archiveChat(req.user._id, chatId);
      return res.json(result);
    } catch (error) {
      console.error('[AI-Chat-DELETE] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to archive chat' });
    }
  }

  /**
   * POST - Stream chat (SSE)
   */
  static async streamChat(req, res) {
    const controllerEnteredAt = Date.now();
    const requestStartedAt = req.aiRequestReceivedAt || controllerEnteredAt;
    const requestId = req.get('x-ai-request-id') || req.id || String(requestStartedAt);
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const body = req.body;
      const message = body.message?.trim();
      const displayMessage = body.displayMessage?.trim() || message;
      // Validate message exists (only reject if no message at all)
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const validationMs = Date.now() - controllerEnteredAt;
      const routingStartedAt = Date.now();
      const requestRoute = AIIntentRouterService.route(message);
      const routingMs = Date.now() - routingStartedAt;

      const roleContext = AIChatService.getRoleContext(body.role, req.user);
      let chat;
      const chatLookupStartedAt = Date.now();

      // ── Load or create chat ────────────────────────────────────────────

      if (body.chatId) {
        // Existing chat
        if (!isObjectId(body.chatId)) {
          return res.status(404).json({ error: 'Chat not found' });
        }
        chat = await AIChatRepository.findForStreaming(body.chatId, userId, 6);
        if (!chat) return res.status(404).json({ error: 'Chat not found' });
      } else {
        // NEW: Create empty chat directly — do NOT call sendMessage()
        const result = await AIChatService.createChat(userId, {
          title: message.substring(0, 70),
          roleContext,
          conversationType: body.conversationType || 'assistant',
        });
        chat = result.chat;
      }
      const chatLookupMs = Date.now() - chatLookupStartedAt;

      // ── Set up SSE ─────────────────────────────────────────────────────

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();
      const acknowledgedMs = Date.now() - requestStartedAt;

      const sendSSE = (event) => {
        if (res.writableEnded || res.destroyed) return false;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.flush?.();
        return true;
      };

      sendSSE({ type: 'start', chatId: String(chat._id) });
      sendSSE({ type: 'typing' });
      const statusMessage = /market insight|market research|industry analysis|country report|price trend/i.test(message)
        ? 'Preparing market analysis...'
        : AIChatService.needsMarketplaceContext(message)
          ? 'Searching marketplace...'
          : 'Preparing your answer...';
      let loadingTimer = setTimeout(() => sendSSE({ type: 'status', message: statusMessage }), 500);
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': keep-alive\n\n');
      }, 10_000);
      const requestAbort = new AbortController();
      res.once('close', () => {
        if (!res.writableEnded) requestAbort.abort();
      });

      try {
        const cacheLookupStartedAt = Date.now();
        const semanticCached = requestRoute.handling === 'direct'
          ? null
          : await AISemanticCacheService.get(message, requestRoute.cacheCategory);
        const cacheLookupMs = Date.now() - cacheLookupStartedAt;
        const contextStartedAt = Date.now();
        // Intent routing happens before expensive retrieval and inference.
        const platformContext = requestRoute.handling === 'direct' || semanticCached
          ? AIChatService.lightweightContext(requestRoute)
          : await AIChatService.buildPlatformContext(message, roleContext, userId, {
            messages: chat.messages,
            context: { ...(chat.context || {}), ...(body.context || {}) },
          });
        const contextAssemblyMs = Date.now() - contextStartedAt;
        const retrievalMs = cacheLookupMs + contextAssemblyMs;
        const promptStartedAt = Date.now();
        const systemPrompt = requestRoute.handling === 'direct' || semanticCached
          ? ''
          : AIService.buildMarketplaceSystemPrompt(
            roleContext,
            `${platformContext.text}${AIChatService.formatSupportContext(body.context)}`,
            platformContext.snapshot.intelligence,
          );
        const promptConstructionMs = Date.now() - promptStartedAt;
        const isSimpleGreeting = platformContext.snapshot.intelligence?.route === 'greeting';
        const budget = inferenceBudget(requestRoute, platformContext.snapshot.intelligence, message);

        let assistantText = '';
        let tokensUsed = 0;
        let activeProvider = 'marketplace';
        let activeModel = null;
        let aiFailed = false;
        let firstTokenAt = 0;
        let draftWasStreamed = false;
        let replaceStreamedDraft = false;
        let ollamaTiming = null;
        const providerStartedAt = Date.now();
        if (requestRoute.handling === 'direct' || semanticCached) {
          assistantText = requestRoute.handling === 'direct' ? requestRoute.response : semanticCached.response;
          activeProvider = requestRoute.handling === 'direct' ? 'marketplace' : 'semantic_cache';
          activeModel = null;
        }

        // Try AI if not simple greeting
        if (!assistantText && req.aiRouting?.provider && req.aiRouting.provider !== 'ollama') {
          throw Object.assign(new Error('Premium AI is not configured'), { statusCode: 503, code: 'AI_PROVIDER_NOT_CONFIGURED' });
        }

        if (!assistantText && !isSimpleGreeting) {
          try {
            const result = await OllamaRuntimeService.complete({
              messages: [
                { role: 'system', content: systemPrompt },
                ...(platformContext.internal?.memory?.selectedMessages || chat.messages.slice(-6)).map(item => ({
                  role: item.role === 'user' ? 'user' : 'assistant',
                  content: String(item.content || '').slice(0, 600),
                })),
                { role: 'user', content: message },
              ],
              stream: true,
              signal: requestAbort.signal,
              timeoutMs: Number(process.env.OLLAMA_STREAM_TIMEOUT_MS || 90_000),
              temperature: 0.18,
              maxTokens: budget.maxTokens,
              contextSize: budget.contextSize,
              onToken(token) {
                if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
                if (!firstTokenAt) firstTokenAt = Date.now();
                assistantText += token;
                draftWasStreamed = true;
                sendSSE({ type: 'token', content: token });
              },
            });
            activeProvider = result.provider;
            activeModel = result.model;
            tokensUsed = result.tokensUsed;
            ollamaTiming = result.timing || null;
          } catch (error) {
            debugLog('[Stream] AI failed:', error.message);
            aiFailed = true;
            replaceStreamedDraft = draftWasStreamed;
            throw error;
          }
        } else if (!assistantText) {
          aiFailed = true;
        }

        // Keep the latency-sensitive streaming path single-provider. A provider
        // failure receives one stable user-facing response, never a repair pass.
        if (aiFailed || !assistantText.trim()) {
          let fallbackText;
          if (isSimpleGreeting) {
            fallbackText = 'Hello! 👋\nWelcome to EsyGlob. How can I help you today?';
            activeProvider = 'smart_intelligence';
            activeModel = null;
          } else {
            fallbackText = 'I can help you with product discovery, supplier matching, and marketplace guidance. How can I assist you?';
            activeProvider = 'fallback';
            activeModel = null;
          }

          assistantText = fallbackText;
          tokensUsed = 0;

        }

        const sanitizationStartedAt = Date.now();
        const sanitized = sanitizeAIOutput(assistantText);
        const sanitizationMs = Date.now() - sanitizationStartedAt;
        const postprocessStartedAt = Date.now();
        let cleanText = sanitized.text || 'I can help with your request. Please try again.';
        if (draftWasStreamed && (sanitized.changed || sanitized.rejected)) replaceStreamedDraft = true;
        const intelligence = platformContext.snapshot.intelligence || {};
        if (sanitized.rejected) {
          cleanText = intelligence.language === 'hi'
            ? 'मैं इस अनुरोध का सुरक्षित उत्तर नहीं दे सका। कृपया निजी जानकारी साझा किए बिना अनुरोध को दोबारा लिखें।'
            : intelligence.language === 'hinglish'
              ? 'Main is request ka safe answer generate nahi kar saka. Private details ke bina request dobara likhein.'
              : 'I could not produce a safe answer for this request. Please rephrase it without private information.';
          replaceStreamedDraft = draftWasStreamed;
        }
        const validation = { passed: !sanitized.rejected, issues: sanitized.rejected ? [{ code: 'AI_OUTPUT_UNSAFE' }] : [] };
        const regenerated = false;
        const validationAndRepairMs = Date.now() - postprocessStartedAt;

        if (!semanticCached && requestRoute.handling !== 'direct' && validation.passed && requestRoute.cacheCategory) {
          AISemanticCacheService.put(message, cleanText, requestRoute.cacheCategory).catch(() => undefined);
        }

        // Direct/cache/fallback responses are emitted here; Gemma tokens were
        // already emitted through the runtime's single final-answer filter.
        if (!draftWasStreamed) {
          if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
          for (const word of cleanText.match(/\S+\s*|\n+/g) || []) {
            if (!firstTokenAt) firstTokenAt = Date.now();
            sendSSE({ type: 'token', content: word });
          }
        } else if (replaceStreamedDraft) {
          sendSSE({ type: 'replace', content: cleanText });
        }
        sendSSE({ type: 'generation_complete' });
        const providerMs = Date.now() - providerStartedAt;
        const suggestedFollowUps = AIChatService.buildSuggestedFollowUps({
          message,
          role: roleContext,
          snapshot: platformContext.snapshot,
        });
        const publicMarketplace = AIChatService.publicMarketplaceSnapshot(platformContext.snapshot);
        const citedSources = (platformContext.snapshot.liveSources || []).slice(0, 3).map(source => ({
          title: source.title,
          url: source.url,
          publishedDate: source.publishedDate || null,
        }));

        // ── SINGLE database write ────────────────────────────────────────
        const persistenceStartedAt = Date.now();
        await AIChatRepository.updateChatAfterResponse(chat._id, userId, {
          userMessage: {
            role: 'user',
            content: displayMessage,
            timestamp: new Date(),
            metadata: body.pluginPayload
              ? { pluginPayload: body.pluginPayload, pluginId: body.pluginPayload.pluginId }
              : undefined,
          },
          assistantMessage: {
            role: 'assistant',
            content: cleanText,
            tokens: tokensUsed,
            timestamp: new Date(),
            metadata: {
              fallback: aiFailed,
              provider: activeProvider,
              model: activeModel,
              streamed: true,
              card: body.responseCard || undefined,
              marketplace: publicMarketplace,
              suggestedFollowUps,
              sources: citedSources,
              validation: {
                passed: validation.passed,
                regenerated,
                issues: validation.issues.map(issue => issue.code),
              },
            },
          },
          provider: activeProvider,
          model: activeModel,
          tokensUsed,
          contextUpdates: {
            'context.lastQuery': message,
            'context.language': platformContext.snapshot.intelligence?.language,
            'context.intent': platformContext.snapshot.intelligence?.intent,
            'context.conversationSummary': platformContext.internal?.memory?.summary,
            'context.entities': platformContext.internal?.memory?.entities,
            'context.preferences': platformContext.internal?.memory?.preferences,
            'context.marketplaceSnapshot': platformContext.snapshot,
          },
        });
        const persistenceMs = Date.now() - persistenceStartedAt;

        const creditStartedAt = Date.now();
        const credits = await commitUsageReservation(req, { responseTokens: tokensUsed, responseTime: Date.now() - requestStartedAt });
        const creditSettlementMs = Date.now() - creditStartedAt;
        const timing = {
          requestId,
          validationMs,
          creditReservationMs: controllerEnteredAt - requestStartedAt,
          routingMs,
          chatLookupMs,
          acknowledgedMs,
          cacheLookupMs,
          contextAssemblyMs,
          promptConstructionMs,
          promptChars: systemPrompt.length,
          memoryMessages: platformContext.internal?.memory?.selectedMessages?.length || 0,
          retrievalMs,
          databaseLookupMs: retrievalMs,
          providerMs,
          ollamaInferenceMs: providerMs,
          ollama: ollamaTiming,
          sanitizationMs,
          validationAndRepairMs,
          persistenceMs,
          creditSettlementMs,
          timeToFirstTokenMs: firstTokenAt ? firstTokenAt - requestStartedAt : null,
          totalMs: Date.now() - requestStartedAt,
        };
        sendSSE({
          type: 'done',
          chatId: String(chat._id),
          model: activeModel,
          provider: activeProvider,
          tokensUsed,
          marketplace: publicMarketplace,
          suggestedFollowUps,
          sources: citedSources,
          validation: {
            passed: validation.passed,
            regenerated,
            issues: validation.issues.map(issue => issue.code),
          },
          credits,
          timing,
        });
        if (process.env.AI_PERFORMANCE_LOGS !== 'false') {
          console.info('[AI-Chat-Performance]', JSON.stringify(timing));
        }
      } catch (error) {
        console.error('[Stream] Error:', error);
        await releaseUsageReservation(req, error).catch(() => undefined);
        sendSSE({ type: 'error', message: 'EsyGlob AI could not complete the response. Please retry in a moment.' });
      } finally {
        if (loadingTimer) clearTimeout(loadingTimer);
        clearInterval(heartbeat);
        res.end();
      }
    } catch (error) {
      console.error('[Stream-POST] Error:', error);
      await releaseUsageReservation(req, error).catch(() => undefined);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to stream chat' });
      }
      res.end();
    }
  }

  /**
   * GET - AI status
   */
  static async getStatus(req, res) {
    const { status: statusOnly } = req.query;

    if (statusOnly === 'true') {
      const health = await AIService.healthCheck();
      return res.json({
        status: health.online ? 'operational' : 'degraded',
        providers: { ollama: OllamaRuntimeService.status() },
        cache: { responses: health.responseCache, semantic: AISemanticCacheService.status() },
        architecture: { gemmaFirst: true, chatbotRag: false, platformGuide: EsyGlobAIGuideService.status() },
      });
    }

    return res.json({ ok: true });
  }
}

export default AIChatController;
