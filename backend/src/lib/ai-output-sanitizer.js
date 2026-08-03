const TAGGED_REASONING = /<\s*(think|thinking|analysis|reasoning|planning|internal(?:_notes?)?|scratchpad)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const UNCLOSED_REASONING = /<\s*(think|thinking|analysis|reasoning|planning|internal(?:_notes?)?|scratchpad)\b[^>]*>[\s\S]*$/gi;
const ORPHAN_REASONING_TAGS = /<\s*\/?\s*(think|thinking|analysis|reasoning|planning|internal(?:_notes?)?|scratchpad)\b[^>]*>/gi;
const MARKED_REASONING_SECTION = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:thinking|analysis|reasoning|planning|internal notes?|prompt analysis)\s*:?\s*\n[\s\S]*?(?=\n\s*(?:#{1,6}\s*)?(?:final answer|answer|response)\s*:?\s*\n|$)/gi;
const FINAL_ANSWER_LABEL = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:final answer|answer|response)\s*:\s*(?=\n|$)/gi;

export const INTERNAL_DISCLOSURE_PATTERN = /(?:\bthe user (?:is asking|asked|wants|needs|requested)\b|\b(?:i|we) (?:should|will|need to|must|am going to|are going to) (?:answer|respond|explain|provide|request|use|consider|mention|avoid|determine|craft)\b|\bneed to (?:answer|respond|determine|craft)\b|\blet(?:'s| us) (?:answer|respond|analyze|reason|plan|craft)\b|\bgiven (?:the )?user(?:'s)? (?:request|question|message)\b|\blooking at (?:the )?(?:conversation|context|messages?)\b|\bbased on (?:the )?(?:context|prompt|instructions?)\b|\baccording to (?:my|the|system) instructions?\b|\bthe system prompt (?:says|requires|instructs)?\b|\bthe conversation says\b|\b(?:internal|hidden) (?:reasoning|analysis|notes?|planning)\b|\bchain[ -]of[ -]thought\b|\bprompt (?:analysis|interpretation|reasoning)\b|^\s*(?:#{1,6}\s*)?(?:thinking|planning|reasoning|internal notes?|prompt analysis)\s*:?\s*$)/i;

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
