const CONTACT_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\b\d{10,15}\b/,
  /\b(?:\+?[\d]{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,6}\b/,
  /\b(?:whatsapp|telegram|skype|wechat|signal|viber|line|kik|snapchat)\b/i,
  /\bhttps?:\/\/(?:www\.)?(?:wa\.me|t\.me|telegram\.me|join\.skype\.com)\b/i,
];

function stringifyValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

function extractTextFields(messageData) {
  const fields = ['content'];
  const nested = [
    'productDetails.productName',
    'productDetails.productLink',
    'orderDetails.actionUrl',
    'rfqDetails.actionUrl',
    'quotationDetails.actionUrl',
  ];

  const texts = [];

  for (const field of fields) {
    const value = messageData[field];
    if (value) texts.push(stringifyValue(value));
  }

  for (const path of nested) {
    const keys = path.split('.');
    let value = messageData;
    for (const key of keys) {
      value = value?.[key];
      if (value == null) break;
    }
    if (value) texts.push(stringifyValue(value));
  }

  if (Array.isArray(messageData.attachments)) {
    for (const att of messageData.attachments) {
      if (att?.name) texts.push(att.name);
      if (att?.url) texts.push(att.url);
    }
  }

  return texts.join(' ');
}

export function validateNoContactInfo(messageData) {
  const text = extractTextFields(messageData);

  for (const pattern of CONTACT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        ok: false,
        error: 'Sharing personal contact information is not allowed. Please keep communication within the platform.',
      };
    }
  }

  return { ok: true };
}