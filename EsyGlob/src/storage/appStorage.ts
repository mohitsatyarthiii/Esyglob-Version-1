import { createMMKV, MMKV } from 'react-native-mmkv';

let storage: MMKV | null = null;
const memoryFallback = new Map<string, string>();
let nativeStorageUnavailable = false;

function getStorage() {
  if (!storage && !nativeStorageUnavailable) {
    try {
      storage = createMMKV({ id: 'esyglob.mobile' });
    } catch {
      nativeStorageUnavailable = true;
    }
  }

  return storage;
}

export const appStorage = {
  getString(key: string) {
    try {
      return getStorage()?.getString(key) ?? memoryFallback.get(key);
    } catch {
      return memoryFallback.get(key);
    }
  },
  set(key: string, value: string | number | boolean | ArrayBuffer) {
    try {
      const native = getStorage();
      if (native) native.set(key, value);
      else memoryFallback.set(key, String(value));
    } catch {
      memoryFallback.set(key, String(value));
    }
  },
  remove(key: string) {
    memoryFallback.delete(key);
    try {
      getStorage()?.remove(key);
    } catch {
      // Storage cleanup must never prevent logout or app startup.
    }
  },
  clearAll() {
    memoryFallback.clear();
    try {
      getStorage()?.clearAll();
    } catch {
      // A failed native clear must not leave the in-memory session alive.
    }
  },
};

export function readJson<T>(key: string): T | null {
  const value = appStorage.getString(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    appStorage.remove(key);
    return null;
  }
}

export function writeJson<T>(key: string, value: T | null) {
  if (value == null) {
    appStorage.remove(key);
    return;
  }

  appStorage.set(key, JSON.stringify(value));
}
