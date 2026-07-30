function serializeError(error) {
  if (!error) return undefined;
  return {
    name: error.name || 'Error',
    code: error.code,
    statusCode: error.statusCode,
    message: String(error.message || error).slice(0, 500),
    stack: error.stack ? String(error.stack).split('\n').slice(0, 8).join('\n') : undefined,
  };
}

export function logImageSearch(level, event, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
    ...(details.error ? { error: serializeError(details.error) } : {}),
  };
  const line = `[ImageSearch] ${JSON.stringify(payload)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export function imageSourceMetadata(imageUrl) {
  try {
    const url = new URL(imageUrl);
    return { imageHost: url.hostname, imagePathType: url.pathname.includes('/image/upload/') ? 'cloudinary-image' : 'other' };
  } catch {
    return { imageHost: 'invalid', imagePathType: 'invalid' };
  }
}
