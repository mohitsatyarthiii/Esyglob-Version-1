import { config } from '../config/env';

type ImageOptions = {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain';
};

export function normalizeImageUrl(value?: string | null, options: ImageOptions = {}) {
  const raw = typeof value === 'string' ? value.trim() : '';

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

export function firstImage(...values: Array<string | string[] | null | undefined>) {
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
