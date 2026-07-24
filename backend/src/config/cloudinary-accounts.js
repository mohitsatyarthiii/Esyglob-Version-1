const LEGACY_KEYS = {
  cloudName: 'CLOUDINARY_CLOUD_NAME',
  apiKey: 'CLOUDINARY_API_KEY',
  apiSecret: 'CLOUDINARY_API_SECRET',
};

const NUMBERED_KEY = /^CLOUDINARY_ACCOUNT_(\d+)_(CLOUD_NAME|API_KEY|API_SECRET|ENABLED)$/;

function normalizeAccount(value, fallbackId) {
  if (!value || typeof value !== 'object') return null;

  const cloudName = String(value.cloudName || value.cloud_name || '').trim();
  const apiKey = String(value.apiKey || value.api_key || '').trim();
  const apiSecret = String(value.apiSecret || value.api_secret || '').trim();
  const enabled = value.enabled !== false && String(value.enabled ?? 'true').toLowerCase() !== 'false';

  if (!enabled || !cloudName || !apiKey || !apiSecret) return null;

  return {
    id: String(value.id || fallbackId || cloudName).trim(),
    cloudName,
    apiKey,
    apiSecret,
  };
}

function loadJsonAccounts() {
  const raw = process.env.CLOUDINARY_ACCOUNTS_JSON;
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('CLOUDINARY_ACCOUNTS_JSON must be a valid JSON array');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('CLOUDINARY_ACCOUNTS_JSON must be a JSON array');
  }

  return parsed
    .map((account, index) => normalizeAccount(account, `cloudinary-json-${index + 1}`))
    .filter(Boolean);
}

function loadNumberedAccounts() {
  const grouped = new Map();

  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(NUMBERED_KEY);
    if (!match) continue;

    const index = Number(match[1]);
    const property = {
      CLOUD_NAME: 'cloudName',
      API_KEY: 'apiKey',
      API_SECRET: 'apiSecret',
      ENABLED: 'enabled',
    }[match[2]];

    grouped.set(index, { ...(grouped.get(index) || {}), [property]: value });
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, account]) => normalizeAccount(account, `cloudinary-${index}`))
    .filter(Boolean);
}

function loadLegacyAccount() {
  return normalizeAccount({
    id: 'cloudinary-primary',
    cloudName: process.env[LEGACY_KEYS.cloudName],
    apiKey: process.env[LEGACY_KEYS.apiKey],
    apiSecret: process.env[LEGACY_KEYS.apiSecret],
  });
}

function uniqueAccounts(accounts) {
  const seen = new Set();
  const usedIds = new Map();
  return accounts.flatMap((account) => {
    const identity = `${account.cloudName}:${account.apiKey}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    const count = (usedIds.get(account.id) || 0) + 1;
    usedIds.set(account.id, count);
    return [{ ...account, id: count === 1 ? account.id : `${account.id}-${count}` }];
  });
}

/**
 * Supported configuration, in priority order:
 * 1. Existing CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET (backward compatible)
 * 2. CLOUDINARY_ACCOUNTS_JSON (unlimited account list)
 * 3. CLOUDINARY_ACCOUNT_<N>_* variables (unlimited numbered accounts)
 */
export function loadCloudinaryAccounts() {
  return uniqueAccounts([
    loadLegacyAccount(),
    ...loadJsonAccounts(),
    ...loadNumberedAccounts(),
  ].filter(Boolean));
}
