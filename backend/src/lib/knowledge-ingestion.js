import crypto from 'node:crypto';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const STOP_WORDS = new Set([
  'about', 'after', 'also', 'and', 'are', 'been', 'before', 'being', 'between', 'can',
  'from', 'have', 'into', 'more', 'must', 'should', 'that', 'their', 'there', 'these',
  'the', 'this', 'through', 'using', 'with', 'will', 'your',
]);

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function cleanKnowledgeContent(value = '', sourceType = 'text') {
  let text = String(value || '').replace(/\r\n?/g, '\n');
  if (sourceType === 'html') {
    text = text
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
    text = decodeEntities(text);
  }
  if (sourceType === 'markdown') {
    text = text
      .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
      .replace(/```[\s\S]*?```/g, block => block.replace(/```[^\n]*\n?|```/g, ''))
      .replace(/^\s{0,3}#{1,6}\s+/gm, '');
  }
  return text
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractKnowledgeContent(file, fallbackContent = '') {
  if (!file) return cleanKnowledgeContent(fallbackContent, 'text');
  const mime = String(file.mimetype || '').toLowerCase();
  const name = String(file.originalname || '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    const result = await pdf(file.buffer);
    return cleanKnowledgeContent(result.text, 'text');
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || name.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return cleanKnowledgeContent(result.value, 'text');
  }
  const sourceType = mime.includes('html') || name.endsWith('.html') || name.endsWith('.htm')
    ? 'html'
    : mime.includes('markdown') || name.endsWith('.md')
      ? 'markdown'
      : 'text';
  return cleanKnowledgeContent(file.buffer.toString('utf8'), sourceType);
}

export function inferSourceType(file) {
  const name = String(file?.originalname || '').toLowerCase();
  const mime = String(file?.mimetype || '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.md') || mime.includes('markdown')) return 'markdown';
  if (name.endsWith('.html') || name.endsWith('.htm') || mime.includes('html')) return 'html';
  return file ? 'text' : 'manual';
}

export function contentHash(content) {
  return crypto.createHash('sha256').update(String(content || '')).digest('hex');
}

export function extractKeywords(content, limit = 24) {
  const counts = new Map();
  for (const token of String(content).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) || []) {
    if (STOP_WORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

export function chunkKnowledgeContent(content, { maxLength = 1_400, overlap = 180 } = {}) {
  const paragraphs = String(content || '').split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  let heading = '';

  const push = () => {
    if (!current.trim()) return;
    chunks.push({ heading, content: current.trim() });
    current = current.slice(Math.max(0, current.length - overlap)).trim();
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length < 120 && !/[.!?]$/.test(paragraph)) heading = paragraph;
    const sentences = paragraph.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/g) || [paragraph];
    for (const sentence of sentences) {
      if (current && current.length + sentence.length + 1 > maxLength) push();
      if (sentence.length > maxLength) {
        for (let index = 0; index < sentence.length; index += maxLength - overlap) {
          const part = sentence.slice(index, index + maxLength);
          if (current) push();
          current = part;
          push();
        }
      } else {
        current = `${current} ${sentence}`.trim();
      }
    }
    current = `${current}\n`.trimStart();
  }
  push();
  return chunks;
}
