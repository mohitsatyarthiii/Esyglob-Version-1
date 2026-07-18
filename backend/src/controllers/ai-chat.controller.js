import AIChatService from '../services/ai-chat.service.js';
import AIChatRepository from '../repositories/ai-chat.repository.js';
import AIService from '../lib/ai-service.js';
import mongoose from 'mongoose';
import { buildRepairPrompt, validateAIResponse } from '../lib/ai-response-validator.js';

// Ollama streaming configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://ai.esyglob.in';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const OLLAMA_ENABLED = process.env.OLLAMA_ENABLED !== 'false';
// Large enough to finish normal trade answers while remaining bounded for the 3B provider.
const CHAT_MAX_TOKENS = Number(process.env.AI_CHAT_MAX_TOKENS || 520);

// Provider health tracking
const providerHealth = {
  ollama: { failures: 0, successes: 0, totalLatency: 0, rateLimits: 0, timeouts: 0 },
  groq: { failures: 0, successes: 0, totalLatency: 0, rateLimits: 0, timeouts: 0 },
  gemini: { failures: 0, successes: 0, totalLatency: 0, rateLimits: 0, timeouts: 0 },
};

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function debugLog(...args) {
  if (process.env.AI_DEBUG === 'true') console.log(...args);
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
      return res.status(500).json({ error: 'Failed to fetch chats', details: error.message });
    }
  }

  /**
   * POST - Send message (non-streaming)
   */
  static async sendMessage(req, res) {
    try {
      const result = await AIChatService.sendMessage(req.user._id, req.body, req.user);
      return res.json(result);
    } catch (error) {
      console.error('[AI-Chat-POST] Error:', error);
      if (error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to process chat', details: error.message });
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
    const requestStartedAt = Date.now();
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

      const roleContext = AIChatService.getRoleContext(body.role, req.user);
      let chat;

      // ── Load or create chat ────────────────────────────────────────────

      if (body.chatId) {
        // Existing chat
        if (!isObjectId(body.chatId)) {
          return res.status(404).json({ error: 'Chat not found' });
        }
        const result = await AIChatService.getUserChats(userId, { chatId: body.chatId });
        chat = result.chat;
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

      // ── Set up SSE ─────────────────────────────────────────────────────

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();

      const sendSSE = (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      sendSSE({ type: 'start', chatId: String(chat._id) });
      sendSSE({ type: 'typing' });
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': keep-alive\n\n');
      }, 10_000);

      try {
        // Build platform context
        const retrievalStartedAt = Date.now();
        const platformContext = await AIChatService.buildPlatformContext(message, roleContext, userId);
        const retrievalMs = Date.now() - retrievalStartedAt;
        const systemPrompt = AIService.buildMarketplaceSystemPrompt(
          roleContext,
          `${platformContext.text}${AIChatService.formatSupportContext(body.context)}`
        );
        const smartResponse = AIChatService.resolveSmartResponse({
          message,
          role: roleContext,
          results: platformContext.results,
          forceAI: Boolean(body.forceAI),
        });

        const isSimpleGreeting = /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|who are you|what can you do|what is your name)[\s.!?]*$/i.test(message);

        let assistantText = '';
        let tokensUsed = 0;
        let activeProvider = 'smart';
        let activeModel = 'default';
        let aiFailed = false;
        let firstTokenAt = 0;
        const providerStartedAt = Date.now();

        // Try AI if not simple greeting
        if (!isSimpleGreeting && smartResponse.shouldUseAI !== false) {
          try {
            if (OLLAMA_ENABLED) {
              const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(Number(process.env.OLLAMA_STREAM_TIMEOUT_MS || 65000)),
                body: JSON.stringify({
                  model: OLLAMA_MODEL,
                  keep_alive: process.env.OLLAMA_KEEP_ALIVE || '60m',
                  messages: [
                    { role: 'system', content: systemPrompt },
                    ...chat.messages.slice(-4).map(item => ({
                      role: item.role === 'user' ? 'user' : 'assistant',
                      content: String(item.content || '').slice(0, 1200),
                    })),
                    { role: 'user', content: message },
                  ],
                  stream: true,
                  options: {
                    temperature: 0.35,
                    top_p: 0.9,
                    num_predict: CHAT_MAX_TOKENS,
                  },
                }),
              });

              if (ollamaResponse.ok && ollamaResponse.body) {
                activeProvider = 'ollama';
                activeModel = OLLAMA_MODEL;

                const reader = ollamaResponse.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                      const data = JSON.parse(line);
                      const token = data.message?.content || data.response || '';
                      if (token) {
                        if (!firstTokenAt) firstTokenAt = Date.now();
                        assistantText += token;
                      }
                      if (data.eval_count) tokensUsed = data.eval_count;
                    } catch (e) {
                      // Skip parse errors
                    }
                  }
                }

                // Update health
                providerHealth.ollama.successes++;
              } else {
                throw new Error('Ollama stream failed');
              }
            } else {
              throw new Error('Ollama disabled');
            }
          } catch (error) {
            debugLog('[Stream] AI failed:', error.message);
            providerHealth.ollama.failures++;
            aiFailed = true;
          }
        } else {
          aiFailed = true;
        }

        // Fallback to smart response
        if (aiFailed || !assistantText.trim()) {
          let fallbackText;
          if (!isSimpleGreeting && smartResponse.shouldUseAI === false && smartResponse.response) {
            fallbackText = smartResponse.response.trim();
            activeProvider = smartResponse.source || 'smart_intelligence';
            activeModel = 'smart-intelligence';
          } else if (isSimpleGreeting) {
            fallbackText = 'Hello! How can I help you with your B2B sourcing needs today?';
            activeProvider = 'smart_intelligence';
            activeModel = 'greeting-fallback';
          } else {
            fallbackText = 'I can help you with product discovery, supplier matching, and marketplace guidance. How can I assist you?';
            activeProvider = 'fallback';
            activeModel = 'offline-fallback';
          }

          assistantText = fallbackText;
          tokensUsed = 0;

        }

        let cleanText = assistantText.trim() || 'I can help with your request. Please try again.';
        const intelligence = platformContext.snapshot.intelligence || {};
        let validation = validateAIResponse({
          message,
          response: cleanText,
          intelligence,
          snapshot: platformContext.snapshot,
        });
        let regenerated = false;

        // Never expose an unvalidated draft. One bounded repair pass prevents loops.
        if (!validation.passed) {
          try {
            const repair = await AIChatService.callOllama(
              buildRepairPrompt({ message, response: cleanText, validation, intelligence }),
              chat.messages.slice(-4),
              systemPrompt,
              { maxTokens: CHAT_MAX_TOKENS, temperature: 0.2 },
            );
            const repairedText = String(repair.message || '').trim();
            const repairedValidation = validateAIResponse({
              message,
              response: repairedText,
              intelligence,
              snapshot: platformContext.snapshot,
            });
            regenerated = true;
            if (repairedValidation.passed) {
              cleanText = repairedText;
              validation = repairedValidation;
              tokensUsed += Number(repair.tokensUsed || 0);
              activeProvider = repair.provider || activeProvider;
              activeModel = repair.model || activeModel;
            } else {
              validation = repairedValidation;
            }
          } catch (repairError) {
            debugLog('[Validator] Repair failed:', repairError.message);
          }
        }

        if (!validation.passed) {
          const critical = validation.issues.some(issue => issue.severity === 'critical');
          if (critical) {
            cleanText = intelligence.language === 'hi'
              ? 'मैं इस अनुरोध का सुरक्षित और सत्यापित उत्तर नहीं दे सका। कृपया निजी जानकारी साझा किए बिना अनुरोध को दोबारा लिखें।'
              : intelligence.language === 'hinglish'
                ? 'Main is request ka safe aur verified answer generate nahi kar saka. Private details ke bina request dobara likhein.'
                : 'I could not produce a safe, verified answer for this request. Please rephrase it without including private information.';
          }
        }

        // Only the validated/repaired final response is streamed to the client.
        for (const word of cleanText.match(/\S+\s*|\n+/g) || []) {
          if (!firstTokenAt) firstTokenAt = Date.now();
          sendSSE({ type: 'token', content: word });
        }
        const providerMs = Date.now() - providerStartedAt;
        const suggestedFollowUps = AIChatService.buildSuggestedFollowUps({
          message,
          role: roleContext,
          snapshot: platformContext.snapshot,
        });

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
              marketplace: platformContext.snapshot,
              suggestedFollowUps,
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
            'context.marketplaceSnapshot': platformContext.snapshot,
          },
        });
        const persistenceMs = Date.now() - persistenceStartedAt;

        sendSSE({
          type: 'done',
          chatId: String(chat._id),
          model: activeModel,
          provider: activeProvider,
          tokensUsed,
          marketplace: platformContext.snapshot,
          suggestedFollowUps,
          validation: {
            passed: validation.passed,
            regenerated,
            issues: validation.issues.map(issue => issue.code),
          },
          timing: {
            retrievalMs,
            providerMs,
            persistenceMs,
            timeToFirstTokenMs: firstTokenAt ? firstTokenAt - requestStartedAt : null,
            totalMs: Date.now() - requestStartedAt,
          },
        });
      } catch (error) {
        console.error('[Stream] Error:', error);
        sendSSE({ type: 'error', message: 'An error occurred during streaming' });
      } finally {
        clearInterval(heartbeat);
        res.end();
      }
    } catch (error) {
      console.error('[Stream-POST] Error:', error);
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
      return res.json({
        status: 'operational',
        providers: {
          ollama: {
            enabled: OLLAMA_ENABLED,
            baseUrl: OLLAMA_BASE_URL,
            model: OLLAMA_MODEL,
          },
        },
        health: {
          ollama: providerHealth.ollama,
          groq: providerHealth.groq,
          gemini: providerHealth.gemini,
        },
      });
    }

    return res.json({ ok: true });
  }
}

export default AIChatController;
