import { createMMKV, MMKV } from 'react-native-mmkv';

let storage: MMKV | null = null;

function getStorage() {
  if (!storage) {
    storage = createMMKV({ id: 'esyglob.mobile' });
  }

  return storage;
}

export const appStorage = {
  getString(key: string) {
    return getStorage().getString(key);
  },
  set(key: string, value: string | number | boolean | ArrayBuffer) {
    getStorage().set(key, value);
  },
  remove(key: string) {
    getStorage().remove(key);
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
