declare const process:
  | {
      env?: {
        ESYGLOB_API_BASE_URL?: string;
        ESYGLOB_SESSION_COOKIE_NAME?: string;
      };
    }
  | undefined;
const env = typeof process === 'undefined' ? undefined : process.env;
const apiBaseUrl = (env?.ESYGLOB_API_BASE_URL || 'https://api.esyglob.in/api').replace(/\/+$/, '');

if (!apiBaseUrl.startsWith('https://')) {
  throw new Error('ESYGLOB_API_BASE_URL must use HTTPS.');
}

export const config = {
  apiBaseUrl,
  socketBaseUrl: new URL(apiBaseUrl).origin,
  sessionCookieName: env?.ESYGLOB_SESSION_COOKIE_NAME || 'esyglob_session',
};
