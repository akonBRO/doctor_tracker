import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth.js';

export function requireAdmin(auth: AuthService): RequestHandler {
  return async (req, res, next) => {
    res.locals.admin = await auth.authenticate(req);
    next();
  };
}
