import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { totpSchema, recoverySchema } from '@doctor-tracker/shared';
import type { Config } from './config/env.js';
import { AuthService } from './services/auth.js';
import { doctorRoutes } from './routes/doctors.js';
import { AppError } from './utils/errors.js';
import { hashPassword, hashToken, randomToken } from './utils/security.js';
import {
  cookieNames,
  cookieOptions,
  csrfProtection,
  csrfToken,
  validCsrf,
  rejectUnsafeInput,
  rejectQueryParameters,
} from './middleware/security.js';
import { Challenge } from './models/auth.js';
import { logger } from './utils/logger.js';

export async function createApp(config: Config) {
  const app = express();
  const auth = new AuthService(config, await hashPassword(randomToken()));
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-Id', res.locals.requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const start = Date.now();
    res.on('finish', () =>
      logger.info({
        event: 'http',
        requestId: res.locals.requestId,
        method: req.method,
        status: res.statusCode,
        durationMs: Date.now() - start,
      }),
    );
    next();
  });
  app.use(helmet({ hsts: config.COOKIE_SECURE ? undefined : false }));
  app.use(
    cors({
      origin(origin, callback) {
        callback(
          origin && origin !== config.WEB_ORIGIN
            ? new AppError(403, 'CORS_REJECTED', 'This origin is not allowed.')
            : null,
          true,
        );
      },
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    }),
  );
  app.use(express.json({ limit: '16kb', strict: true }), cookieParser());
  app.use(csrfProtection(config), rejectUnsafeInput);
  const limiter = (limit: number, windowMs = 15 * 60_000) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler(_req, _res, next) {
        next(
          new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait before trying again.'),
        );
      },
    });
  app.use('/api/v1', limiter(200, 60_000));
  app.get('/api/v1/health', rejectQueryParameters, (_req, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ data: { status: mongoose.connection.readyState === 1 ? 'ok' : 'unavailable' } }),
  );
  const router = express.Router();
  router.use(rejectQueryParameters);
  router.get('/csrf', (req, res) => {
    const current: unknown = req.cookies[cookieNames(config).csrf];
    const token = validCsrf(current, config) ? current : csrfToken(config);
    res.cookie(cookieNames(config).csrf, token, { ...cookieOptions(config), maxAge: 86400_000 });
    res.json({ data: { token } });
  });
  const credentialsLimiter = limiter(10);
  const accountLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) =>
      typeof req.body?.email === 'string'
        ? hashToken(req.body.email.toLowerCase().trim())
        : ipKeyGenerator(req.ip ?? 'unknown'),
    handler(_req, _res, next) {
      next(
        new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait before trying again.'),
      );
    },
  });
  router.post('/signup', limiter(5), async (req, res) => {
    res.status(201).json({ data: await auth.signup(req, res) });
  });
  router.post('/login', credentialsLimiter, accountLimiter, async (req, res) => {
    res.json({ data: await auth.login(req, res) });
  });
  router.use(
    '/mfa',
    limiter(20),
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 15,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: async (req) => {
        const value: unknown = req.cookies[cookieNames(config).challenge];
        const challenge =
          typeof value === 'string'
            ? await Challenge.findOne({ tokenHash: hashToken(value) })
            : null;
        return challenge ? challenge.adminId.toString() : ipKeyGenerator(req.ip ?? 'unknown');
      },
      handler(_req, _res, next) {
        next(
          new AppError(
            429,
            'RATE_LIMITED',
            'Too many verification attempts. Please wait before trying again.',
          ),
        );
      },
    }),
  );
  router.get('/mfa/challenge', async (req, res) => {
    res.json({ data: await auth.challengeStatus(req) });
  });
  router.post('/mfa/setup', async (req, res) => {
    res.json({ data: await auth.setup(req) });
  });
  router.post('/mfa/verify', async (req, res) => {
    res.json({ data: await auth.completeMfa(req, res, totpSchema.parse(req.body).code) });
  });
  router.post('/mfa/recovery', async (req, res) => {
    res.json({ data: await auth.completeMfa(req, res, recoverySchema.parse(req.body).code, true) });
  });
  router.post('/refresh', limiter(30), async (req, res) => {
    res.json({ data: await auth.refresh(req, res) });
  });
  router.post('/logout', limiter(30), async (req, res) => {
    res.json({ data: await auth.logout(req, res) });
  });
  router.get('/me', async (req, res) => {
    res.json({ data: { admin: await auth.authenticate(req) } });
  });
  app.use('/api/v1/auth', router);
  app.use('/api/v1/doctors', doctorRoutes(auth));
  app.use((_req, _res, next) =>
    next(new AppError(404, 'NOT_FOUND', 'This endpoint does not exist.')),
  );
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const requestId = res.locals.requestId as string;
    if (error instanceof ZodError) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Check the form fields and try again.',
          fields: error.flatten().fieldErrors,
          requestId,
        },
      });
      return;
    }
    if (error instanceof AppError) {
      res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message, requestId } });
      return;
    }
    if (error?.type === 'entity.too.large') {
      res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'This request is too large.', requestId },
      });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_JSON', message: 'Send a valid JSON object.', requestId } });
      return;
    }
    if (error?.code === 11000) {
      res.status(400).json({
        error: {
          code: 'REGISTRATION_FAILED',
          message: 'Registration could not be completed. Contact your administrator.',
          requestId,
        },
      });
      return;
    }
    if (error?.code === 50) {
      res.status(503).json({
        error: {
          code: 'QUERY_TIMEOUT',
          message:
            'The directory is taking longer than expected. Refine your search and try again.',
          requestId,
        },
      });
      return;
    }
    logger.error({ event: 'request_failed', requestId });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again later.',
        requestId,
      },
    });
  };
  app.use(errorHandler);
  return app;
}
