export function unwrapData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

export function normalizeList<T>(payload: unknown, keys: string[] = []): T[] {
  const data = unwrapData<unknown>(payload);

  if (Array.isArray(data)) {
    return data as T[];
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  for (const key of keys) {
    const value = (data as Record<string, unknown>)[key];

    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  for (const value of Object.values(data as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [];
}

export function normalizeUser(payload: unknown) {
  const data = unwrapData<unknown>(payload);

  if (data && typeof data === 'object' && 'user' in data) {
    return (data as { user: unknown }).user;
  }

  if (payload && typeof payload === 'object' && 'user' in payload) {
    return (payload as { user: unknown }).user;
  }

  return data;
}
