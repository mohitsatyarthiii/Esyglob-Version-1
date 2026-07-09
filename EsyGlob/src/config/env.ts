import { Platform } from 'react-native';

declare const process:
  | {
      env?: {
        ESYGLOB_API_BASE_URL?: string;
        ESYGLOB_SESSION_COOKIE_NAME?: string;
      };
    }
  | undefined;
declare const __DEV__: boolean;

const localBackend = Platform.select({
  android: 'http://10.0.2.2:3001',
  ios: 'http://localhost:3001',
  default: 'http://localhost:3001',
});
const env = typeof process === 'undefined' ? undefined : process.env;
const releaseBackend = 'https://esyglob.in';

export const config = {
  apiBaseUrl: env?.ESYGLOB_API_BASE_URL || (__DEV__ ? localBackend : releaseBackend),
  sessionCookieName: env?.ESYGLOB_SESSION_COOKIE_NAME || 'esyglob_session',
};
