import { readFileSync } from 'node:fs';

const guideUrl = new URL('../../knowledge/esyglob-ai-guide.md', import.meta.url);
const guide = readFileSync(guideUrl, 'utf8').trim();
const sections = new Map(guide.split(/^## /m).slice(1).map(section => {
  const [title, ...body] = section.split('\n');
  return [title.trim().toLowerCase(), `## ${title.trim()}\n${body.join('\n').trim()}`];
}));

function selectedSections(intent) {
  const base = ['identity and purpose', 'response and brand style', 'frequently asked questions', 'platform terminology'];
  const specific = intent === 'policy'
    ? ['payments, refunds, and disputes', 'privacy and account safety', 'restricted activity and products', 'support and escalation']
    : intent === 'membership'
      ? ['account roles and flows', 'verification and trust']
      : ['account roles and flows', 'verification and trust', 'products, enquiries, rfqs, and chat', 'trade and platform rules', 'support and escalation'];
  return [...new Set([...base, ...specific])].map(title => sections.get(title)).filter(Boolean).join('\n\n');
}

export default class EsyGlobAIGuideService {
  static get text() {
    return guide;
  }

  static contextFor(intelligence = {}, message = '') {
    const intent = String(intelligence.intent || '');
    const explicitlyPlatformFacing = /\besyglob\b|\bplatform\b|\bthis (?:site|app|marketplace)\b/i.test(String(message));
    if (!['policy', 'platform_help', 'membership'].includes(intent) && !explicitlyPlatformFacing) return '';
    return selectedSections(intent);
  }

  static status() {
    return { loaded: Boolean(guide), characters: guide.length, source: 'knowledge/esyglob-ai-guide.md' };
  }
}
