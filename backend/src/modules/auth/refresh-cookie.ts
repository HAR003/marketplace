import type { CookieOptions } from 'express';

export const REFRESH_COOKIE_NAME = 'refresh_token';

// The browser only sends the cookie to /auth/* routes, never to the rest of the API
const REFRESH_COOKIE_PATH = '/auth';

export function refreshCookieOptions(
  secure: boolean,
  expires?: Date,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: REFRESH_COOKIE_PATH,
    expires,
  };
}
