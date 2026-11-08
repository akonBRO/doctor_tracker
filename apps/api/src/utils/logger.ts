import pino from 'pino';
// Log only explicitly selected event metadata. Never attach requests, bodies, errors, URLs, or database configuration.
export const logger = pino({
  base: undefined,
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
});
