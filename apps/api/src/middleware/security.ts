import { createHmac } from 'node:crypto';
import type { CookieOptions, RequestHandler } from 'express';
import type { Config } from '../config/env.js';
import { randomToken, safeEqual } from '../utils/security.js';
import { AppError } from '../utils/errors.js';

export function cookieNames(config: Config) {
  const prefix = config.COOKIE_SECURE ? '__Host-' : '';
  return {
    access: `${prefix}dt_access`,
    refresh: `${prefix}dt_refresh`,
    challenge: `${prefix}dt_challenge`,
    csrf: `${prefix}dt_csrf`,
  };
}
export const cookieOptions = (config: Config): CookieOptions => ({
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: 'strict',
  path: '/',
});
export function csrfToken(config: Config) {
  const nonce = randomToken();
  return `${nonce}.${createHmac('sha256', Buffer.from(config.CSRF_SECRET, 'hex')).update(nonce).digest('hex')}`;
}
export function validCsrf(value: unknown, config: Config): value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return false;
  const [nonce, mac] = value.split('.');
  return (
    !!nonce &&
    !!mac &&
    safeEqual(
      mac,
      createHmac('sha256', Buffer.from(config.CSRF_SECRET, 'hex')).update(nonce).digest('hex'),
    )
  );
}
export function csrfProtection(config: Config): RequestHandler {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('origin') !== config.WEB_ORIGIN)
      return next(new AppError(403, 'ORIGIN_REJECTED', 'This request origin is not allowed.'));
    if (!req.is('application/json'))
      return next(new AppError(415, 'JSON_REQUIRED', 'Send this request as JSON.'));
    const token = req.cookies[cookieNames(config).csrf] as unknown;
    const header = req.get('x-csrf-token');
    if (!validCsrf(token, config) || !header || !safeEqual(token, header))
      return next(
        new AppError(
          403,
          'CSRF_REJECTED',
          'Security verification failed. Reload the page and try again.',
        ),
      );
    next();
  };
}
function dangerous(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) =>
      key.startsWith('$') ||
      key.includes('.') ||
      ['__proto__', 'constructor', 'prototype'].includes(key) ||
      dangerous(child),
  );
}
export const rejectUnsafeInput: RequestHandler = (req, _res, next) => {
  if (dangerous(req.body) || dangerous(req.query))
    return next(new AppError(400, 'INVALID_INPUT', 'The request contains unsupported input.'));
  next();
};
export const rejectQueryParameters: RequestHandler = (req, _res, next) => {
  if (Object.keys(req.query).length)
    return next(
      new AppError(400, 'INVALID_QUERY', 'Query parameters are not supported on this endpoint.'),
    );
  next();
};
