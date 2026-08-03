const PRIVATE_BLOCK = 'think|thinking|analysis|reasoning|planning|internal(?:_notes?)?|scratchpad|system|developer|tool(?:_call|_trace)?|prompt';
const TAGGED_REASONING = new RegExp(`<\\s*(${PRIVATE_BLOCK})\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>`, 'gi');
const UNCLOSED_REASONING = new RegExp(`<\\s*(${PRIVATE_BLOCK})\\b[^>]*>[\\s\\S]*$`, 'gi');
const ORPHAN_REASONING_TAGS = new RegExp(`<\\s*\\/?\\s*(${PRIVATE_BLOCK})\\b[^>]*>`, 'gi');
const MARKED_REASONING_SECTION = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:thinking|analysis|reasoning|planning|internal notes?|prompt analysis|system (?:prompt|message)|developer (?:prompt|message)|tool (?:call|trace|output))\s*:?\s*\n[\s\S]*?(?=\n\s*(?:#{1,6}\s*)?(?:final answer|answer|response)\s*:?\s*\n|$)/gi;
const FINAL_ANSWER_LABEL = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:final answer|answer|response)\s*:\s*(?=\n|$)/gi;

export const INTERNAL_DISCLOSURE_PATTERN = /(?:\bthe user (?:\w+\s+){0,2}?(?:is asking|asked|wants|needs|requested)\b|^\s*(?:okay[,!.]?\s*)?(?:i|we) (?:should|will|need to|must|am going to|are going to)\b|^\s*i (?:recall|remember|think|believe|suspect)\b|^\s*they (?:also )?(?:asked|said|specified|requested|want|expect)\b|\bwhich (?:probably|likely) means (?:the user|they)\b|\b(?:i|we) (?:should|will|need to|must|am going to|are going to) (?:answer|respond|explain|provide|request|use|consider|mention|avoid|determine|craft|make)\b|\bi need to be (?:concise|careful|accurate|brief)\b|\bneed to (?:answer|respond|determine|craft)\b|\blet me (?:think|analy[sz]e|reason|plan|consider)\b|\blet(?:'s| us) (?:answer|respond|analyze|reason|plan|craft)\b|\bbefore (?:i )?(?:answer|respond)\b|\bto answer (?:this|the question|the user)\b|\bgiven (?:the )?user(?:'s)? (?:request|question|message)\b|\blooking at (?:the )?(?:conversation|context|messages?)\b|\bbased on (?:the )?(?:context|prompt|instructions?)\b|\baccording to (?:my|the|system) instructions?\b|\bthe system prompt (?:says|requires|instructs)?\b|\bthe (?:developer|system) message (?:says|requires|instructs)?\b|\bmy (?:prompt|instructions?|hidden context)\b|\bthe conversation says\b|\b(?:internal|hidden) (?:reasoning|analysis|notes?|planning)\b|\bchain[ -]of[ -]thought\b|\bprompt (?:analysis|interpretation|reasoning)\b|\btool (?:call|trace|output)\b|^\s*(?:#{1,6}\s*)?(?:thinking|planning|reasoning|internal notes?|prompt analysis|system prompt|developer message|tool trace)\s*:?\s*$)/i;

function removeUnsafeSentences(line) {
  const sentences = String(line).split(/(?<=[.!?])\s+/);
  return sentences.filter(sentence => !INTERNAL_DISCLOSURE_PATTERN.test(sentence)).join(' ');
}

export function sanitizeAIOutput(value = '') {
  const original = String(value || '');
  let text = original
    .replace(TAGGED_REASONING, '\n')
    .replace(UNCLOSED_REASONING, '\n')
    .replace(MARKED_REASONING_SECTION, '\n')
    .replace(FINAL_ANSWER_LABEL, '\n')
    .replace(ORPHAN_REASONING_TAGS, '\n');
  const safeLines = [];
  for (const line of text.split(/\r?\n/)) {
    if (INTERNAL_DISCLOSURE_PATTERN.test(line)) {
      const cleaned = removeUnsafeSentences(line);
      if (cleaned && !INTERNAL_DISCLOSURE_PATTERN.test(cleaned)) safeLines.push(cleaned);
      continue;
    }
    safeLines.push(line);
  }
  text = safeLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return {
    text,
    changed: text !== original.trim(),
    rejected: !text || INTERNAL_DISCLOSURE_PATTERN.test(text),
  };
}

export function assertSafeAIOutput(value) {
  const result = sanitizeAIOutput(value);
  if (result.rejected) {
    throw Object.assign(new Error('Generated response did not pass the final-answer safety boundary'), {
      code: 'AI_OUTPUT_UNSAFE',
      statusCode: 503,
    });
  }
  return result;
}

const STREAM_TAGS = new Set(['think', 'thinking', 'analysis', 'reasoning', 'planning', 'internal', 'internal_notes', 'scratchpad', 'system', 'developer', 'prompt', 'tool', 'tool_call', 'tool_trace']);
const ABBREVIATIONS = new Set(['mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'e.g.', 'i.e.', 'vs.', 'etc.', 'inc.', 'ltd.']);

export class ReasoningStreamFilter {
  constructor({ maxLookahead = 40, maxHiddenChars = 12_000, maxHiddenMs = 15_000, onAnomaly } = {}) {
    this.maxLookahead = maxLookahead;
    this.maxHiddenChars = maxHiddenChars;
    this.maxHiddenMs = maxHiddenMs;
    this.onAnomaly = onAnomaly;
    this.buffer = '';
    this.hiddenTag = null;
    this.hiddenChars = 0;
    this.hiddenSince = 0;
    this.anomalyReported = false;
  }

  process(chunk = '') {
    this.buffer += String(chunk);
    let output = '';
    while (this.buffer) {
      if (this.hiddenTag) {
        const closing = new RegExp(`<\\s*\\/\\s*${this.hiddenTag}\\s*>`, 'i').exec(this.buffer);
        if (closing) {
          this.buffer = this.buffer.slice(closing.index + closing[0].length);
          this.hiddenTag = null;
          this.hiddenChars = 0;
          this.hiddenSince = 0;
          this.anomalyReported = false;
          continue;
        }
        this.hiddenChars += Math.max(0, this.buffer.length - this.maxLookahead);
        this.buffer = this.buffer.slice(-this.maxLookahead);
        if (!this.anomalyReported && (this.hiddenChars > this.maxHiddenChars || Date.now() - this.hiddenSince > this.maxHiddenMs)) {
          this.onAnomaly?.({ code: 'UNCLOSED_REASONING_BLOCK', tag: this.hiddenTag, hiddenChars: this.hiddenChars });
          this.anomalyReported = true;
        }
        break;
      }

      const tagMatch = /<\s*([a-z_][\w-]*)\b[^>]*>/i.exec(this.buffer);
      if (tagMatch && STREAM_TAGS.has(tagMatch[1].toLowerCase())) {
        output += this.buffer.slice(0, tagMatch.index);
        this.hiddenTag = tagMatch[1].toLowerCase();
        this.hiddenSince = Date.now();
        this.buffer = this.buffer.slice(tagMatch.index + tagMatch[0].length);
        continue;
      }
      const safeLength = Math.max(0, this.buffer.length - this.maxLookahead);
      output += this.buffer.slice(0, safeLength);
      this.buffer = this.buffer.slice(safeLength);
      break;
    }
    return output;
  }

  finish() {
    if (this.hiddenTag) {
      this.onAnomaly?.({ code: 'UNCLOSED_REASONING_BLOCK', tag: this.hiddenTag, hiddenChars: this.hiddenChars });
      this.buffer = '';
      return '';
    }
    const output = this.buffer;
    this.buffer = '';
    return output;
  }
}

function isSentenceBoundary(text, index) {
  const char = text[index];
  if (char === '\n') return true;
  if (!'.!?'.includes(char)) return false;
  if (char === '.' && /\d/.test(text[index - 1] || '') && /\d/.test(text[index + 1] || '')) return false;
  const prefix = text.slice(Math.max(0, index - 8), index + 1).toLowerCase();
  if ([...ABBREVIATIONS].some(value => prefix.endsWith(value))) return false;
  return !text[index + 1] || /\s/.test(text[index + 1]);
}

export class SentenceSafetyFilter {
  constructor({ maxPendingChars = 700, onDiscard } = {}) {
    this.maxPendingChars = maxPendingChars;
    this.onDiscard = onDiscard;
    this.buffer = '';
  }

  validate(segment) {
    if (!segment.trim()) return segment;
    const result = sanitizeAIOutput(segment);
    if (result.rejected || result.text !== segment.trim()) {
      this.onDiscard?.({ code: 'INTERNAL_DISCLOSURE_SENTENCE', preview: segment.trim().slice(0, 120) });
      return '';
    }
    return segment;
  }

  process(chunk = '') {
    this.buffer += String(chunk);
    let output = '';
    let start = 0;
    for (let index = 0; index < this.buffer.length; index += 1) {
      if (!isSentenceBoundary(this.buffer, index)) continue;
      output += this.validate(this.buffer.slice(start, index + 1));
      start = index + 1;
    }
    this.buffer = this.buffer.slice(start);
    if (this.buffer.length > this.maxPendingChars) {
      const splitAt = this.buffer.lastIndexOf(' ', this.maxPendingChars);
      if (splitAt > 0) {
        output += this.validate(this.buffer.slice(0, splitAt + 1));
        this.buffer = this.buffer.slice(splitAt + 1);
      }
    }
    return output;
  }

  finish() {
    const output = this.validate(this.buffer);
    this.buffer = '';
    return output;
  }
}

export class FinalAnswerStreamFilter {
  constructor(options = {}) {
    this.reasoning = new ReasoningStreamFilter(options);
    this.sentences = new SentenceSafetyFilter(options);
  }

  process(chunk) {
    return this.sentences.process(this.reasoning.process(chunk));
  }

  finish() {
    return this.sentences.process(this.reasoning.finish()) + this.sentences.finish();
  }
}
