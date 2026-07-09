declare const process:
  | {
      env?: {
        ESYGLOB_API_BASE_URL?: string;
        ESYGLOB_SESSION_COOKIE_NAME?: string;
      };
    }
  | undefined;
const env = typeof process === 'undefined' ? undefined : process.env;

export const config = {
  apiBaseUrl: 'http://localhost:5000/api',
  sessionCookieName: env?.ESYGLOB_SESSION_COOKIE_NAME || 'esyglob_session',
};
