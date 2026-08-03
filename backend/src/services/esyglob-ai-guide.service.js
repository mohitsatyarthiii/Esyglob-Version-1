import { readFileSync } from 'node:fs';

const guideUrl = new URL('../../knowledge/esyglob-ai-guide.md', import.meta.url);
const guide = readFileSync(guideUrl, 'utf8').trim();
const sections = new Map(guide.split(/^## /m).slice(1).map(section => {
  const [title, ...body] = section.split('\n');
  return [title.trim().toLowerCase(), `## ${title.trim()}\n${body.join('\n').trim()}`];
}));

function selectedSections(intent, message) {
  const text = String(message || '').toLowerCase();
  const selected = ['identity and purpose', 'response and brand style'];
  if (/buyer|seller|manufacturer|supplier|account|role|onboard/.test(text)) selected.push('account roles and flows');
  if (/verif|trust|badge|document|kyc/.test(text)) selected.push('verification and trust');
  if (/product|enquir|rfq|quotation|chat|message/.test(text)) selected.push('products, enquiries, rfqs, and chat');
  if (/payment|refund|dispute|escrow/.test(text) || intent === 'policy') selected.push('payments, refunds, and disputes');
  if (/privacy|security|password|personal|data/.test(text)) selected.push('privacy and account safety');
  if (/restricted|prohibited|illegal/.test(text)) selected.push('restricted activity and products');
  if (/trade|import|export|shipping|customs|compliance/.test(text)) selected.push('trade and platform rules');
  if (/support|help|contact|escalat/.test(text)) selected.push('support and escalation');
  if (/what is|how does|faq|meaning|mean/.test(text)) selected.push('frequently asked questions');
  return [...new Set(selected)].map(title => sections.get(title)).filter(Boolean).join('\n\n');
}

export default class EsyGlobAIGuideService {
  static get text() {
    return guide;
  }

  static contextFor(intelligence = {}, message = '') {
    const intent = String(intelligence.intent || '');
    const explicitlyPlatformFacing = /\besyglob\b|\bplatform\b|\bthis (?:site|app|marketplace)\b/i.test(String(message));
    if (!['policy', 'platform_help', 'membership'].includes(intent) && !explicitlyPlatformFacing) return '';
    return selectedSections(intent, message);
  }

  static status() {
    return { loaded: Boolean(guide), characters: guide.length, source: 'knowledge/esyglob-ai-guide.md' };
  }
}
