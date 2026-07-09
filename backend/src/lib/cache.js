const store = new Map();
const pending = new Map();

export function getMemoryCache(key) {
  const item = store.get(key);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return item.value;
}

export function setMemoryCache(key, value, ttlMs = 30000) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  if (store.size > 250) {
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }

  return value;
}

export function invalidateMemoryCache(prefix) {
  for (const key of store.keys()) {
    if (String(key).startsWith(prefix)) {
      store.delete(key);
    }
  }
}

export async function dedupeRequest(key, loader) {
  if (!key) return loader();
  if (pending.has(key)) return pending.get(key);

  const promise = Promise.resolve()
    .then(loader)
    .finally(() => pending.delete(key));

  pending.set(key, promise);
  return promise;
}

export async function cached(key, ttlMs, loader) {
  const cachedValue = getMemoryCache(key);
  if (cachedValue !== null) return cachedValue;

  return dedupeRequest(`cache:${key}`, async () => {
    const value = await loader();
    return setMemoryCache(key, value, ttlMs);
  });
}