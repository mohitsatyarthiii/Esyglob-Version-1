import mongoose from 'mongoose';

export function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

export function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function normalizeObjectId(value) {
  if (!value) return null;
  const raw = typeof value === 'object' ? value._id || value.id : value;
  const id = String(raw || '');
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

export function isGreeting(content = '') {
  return /^(hi|hello|hey|good morning|good afternoon|good evening|greetings|thanks|thank you|bye|goodbye)[\s.!?]*$/i.test(
    content.trim()
  );
}

export function getAutoReplyIntent(content = '') {
  const text = content.toLowerCase();
  if (isGreeting(content)) return 'greeting';
  if (
    /\b(show|send|list|catalog|catalogue).*\b(product|products|items|catalog|catalogue)\b|\b(products|catalog|catalogue)\b/.test(
      text
    )
  )
    return 'catalog';
  if (
    /\b(price|cost|rate|moq|minimum order|quantity|sample|delivery|lead time|shipping|manufacture|manufacturing|certification|certificate|factory|capacity|export|country|payment|methods?|details|specification|material|size|custom)\b/.test(
      text
    )
  )
    return 'product_or_supplier';
  return 'fallback';
}