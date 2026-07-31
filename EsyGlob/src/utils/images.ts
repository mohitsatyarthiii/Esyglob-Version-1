import { config } from '../config/env';

type ImageOptions = {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain';
};

export function normalizeImageUrl(value?: unknown, _options: ImageOptions = {}) {
  const candidate = typeof value === 'object' && value
    ? (value as Record<string, unknown>).url ?? (value as Record<string, unknown>).secure_url ??
      (value as Record<string, unknown>).location ?? (value as Record<string, unknown>).src
    : value;
  const raw = typeof candidate === 'string' ? candidate.trim().replace(/\\/g, '/') : '';

  if (!raw) {
    return null;
  }

  const absolute = raw.startsWith('//')
    ? `https:${raw}`
    : raw.startsWith('/')
      ? `${config.apiBaseUrl}${raw}`
      : raw;

  if (!absolute.startsWith('http://') && !absolute.startsWith('https://')) {
    return null;
  }

  return absolute;
}

export function firstImage(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const found = value.map(item => normalizeImageUrl(item)).find(Boolean);

      if (found) {
        return found;
      }
    } else {
      const found = normalizeImageUrl(value);

      if (found) {
        return found;
      }
    }
  }

  return null;
}
