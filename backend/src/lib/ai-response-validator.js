import { detectLanguage } from './ai-intelligence-pipeline.js';

const SENSITIVE_PATTERNS = [
  { code: 'email_exposure', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { code: 'phone_exposure', pattern: /(?:\+?\d[\s-]?){10,15}/ },
  { code: 'token_exposure', pattern: /\b(?:eyJ[a-zA-Z0-9_-]{20,}|(?:access|refresh|session_token|session_id|sessions|session|auth)[_-]?token\s*[:=])/i },
  { code: 'credential_exposure', pattern: /\b(?:password|otp|cvv|card number)\s*[:=]\s*\S+/i },
];

const MARKETPLACE_RECOMMENDATION = /\b(products?|suppliers?|manufacturers?)\b.*\b(found|recommend|matching|shortlist|available)\b|\b(found|recommend|matching|shortlist)\b.*\b(products?|suppliers?|manufacturers?)\b/i;

function meaningfulTokens(value = '') {
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'what', 'how', 'are', 'you', 'your', 'esyglob', 'please']);
  return [...new Set(String(value).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])]
    .filter(token => !stop.has(token));
}

function relevanceScore(question, answer) {
  const queryTokens = meaningfulTokens(question);
  if (!queryTokens.length) return 1;
  const response = String(answer).toLowerCase();
  return queryTokens.filter(token => response.includes(token)).length / queryTokens.length;
}

function hasAllowedSensitiveContext(snapshot = {}) {
  return Boolean(snapshot.account || snapshot.topOrders?.length || snapshot.topRfqs?.length || snapshot.topQuotations?.length);
}

export function validateAIResponse({ message, response, intelligence = {}, snapshot = {} }) {
  const issues = [];
  const text = String(response || '').trim();
  if (!text) issues.push({ code: 'empty_response', severity: 'critical' });

  const relevance = relevanceScore(message, text);
  if (text.length > 80 && relevance < 0.12) issues.push({ code: 'low_question_relevance', severity: 'high', score: relevance });

  const requestedLanguage = intelligence.language || detectLanguage(message);
  const responseLanguage = detectLanguage(text, requestedLanguage);
  if (requestedLanguage !== 'en' && responseLanguage !== requestedLanguage) {
    issues.push({ code: 'wrong_language', severity: 'high', expected: requestedLanguage, actual: responseLanguage });
  }

  const allowedSources = intelligence.sources || [];
  const marketplaceWasUsed = Boolean(snapshot.productCount || snapshot.supplierCount);
  if (marketplaceWasUsed && !allowedSources.includes('products') && !allowedSources.includes('suppliers')) {
    issues.push({ code: 'wrong_retrieval_tool', severity: 'high' });
  }
  if (!allowedSources.includes('products') && !allowedSources.includes('suppliers') && MARKETPLACE_RECOMMENDATION.test(text)) {
    issues.push({ code: 'unnecessary_marketplace_results', severity: 'high' });
  }

  if (intelligence.requiresPrivateData && !allowedSources.includes('user_data')) {
    issues.push({ code: 'private_tool_not_authorized', severity: 'critical' });
  }
  for (const sensitive of SENSITIVE_PATTERNS) {
    if (sensitive.pattern.test(text) && !hasAllowedSensitiveContext(snapshot)) {
      issues.push({ code: sensitive.code, severity: 'critical' });
    }
  }

  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2) issues.push({ code: 'broken_markdown_fence', severity: 'medium' });
  if (/https?:\/\/\S{180,}/i.test(text)) issues.push({ code: 'malformed_raw_url', severity: 'medium' });
  if (text.length > 90 && /(?:\.{3}|:|,|;|\band|\bor|\bto)$/i.test(text)) {
    issues.push({ code: 'incomplete_response', severity: 'high' });
  }

  const passed = !issues.some(issue => ['critical', 'high'].includes(issue.severity));
  return { passed, issues, relevance, requestedLanguage, responseLanguage };
}

export function buildRepairPrompt({ message, response, validation, intelligence }) {
  return [
    'Rewrite the draft so it passes every quality and privacy check.',
    `Original user request: ${message}`,
    `Detected intent: ${intelligence?.intent || 'general'}`,
    `Required language: ${validation.requestedLanguage || intelligence?.language || 'en'}`,
    `Allowed sources: ${(intelligence?.sources || ['knowledge_base']).join(', ')}`,
    `Failures: ${validation.issues.map(issue => issue.code).join(', ')}`,
    'Answer the actual request completely. Do not invent records, identifiers, links, policies, products, or suppliers. Never include credentials or another user\'s data. Use clean concise Markdown.',
    `Draft to repair:\n${String(response || '').slice(0, 6000)}`,
  ].join('\n\n');
}
