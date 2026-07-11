import { config } from '../config/env';

type ImageOptions = {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain';
};

export function normalizeImageUrl(value?: unknown, options: ImageOptions = {}) {
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

  if (absolute.includes('res.cloudinary.com') && absolute.includes('/image/upload/') && !absolute.includes('/q_auto')) {
    const width = options.width ?? 500;
    const height = options.height;
    const crop = options.fit === 'contain' ? 'c_fit' : 'c_fill';
    const transform = `q_auto:eco,w_${width}${height ? `,h_${height}` : ''},${crop}`;
    return absolute.replace('/image/upload/', `/image/upload/${transform}/`);
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
