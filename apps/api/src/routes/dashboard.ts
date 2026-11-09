import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  dashboardDistributionQuerySchema,
  dashboardTrendQuerySchema,
} from '@doctor-tracker/shared';
import type { AuthService } from '../services/auth.js';
import { requireAdmin } from '../middleware/authorization.js';
import { rejectQueryParameters } from '../middleware/security.js';
import {
  dashboardOverview,
  dashboardDistribution,
  dashboardTrends,
} from '../services/dashboard.js';
import { AppError } from '../utils/errors.js';

export function dashboardRoutes(auth: AuthService) {
  const router = Router();
  router.use(
    requireAdmin(auth),
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (_req, res) => res.locals.admin.id,
      handler: (_req, _res, next) =>
        next(
          new AppError(
            429,
            'RATE_LIMITED',
            'Too many dashboard requests. Please wait before trying again.',
          ),
        ),
    }),
  );
  router.get('/overview', rejectQueryParameters, async (_req, res) => {
    res.json({ data: await dashboardOverview(res.locals.admin) });
  });
  router.get('/patients-by-doctor', async (req, res) => {
    res.json({
      data: await dashboardDistribution(
        res.locals.admin,
        dashboardDistributionQuerySchema.parse(req.query),
      ),
    });
  });
  router.get('/trends', async (req, res) => {
    res.json({
      data: await dashboardTrends(
        res.locals.admin,
        dashboardTrendQuerySchema.parse(req.query).period,
      ),
    });
  });
  return router;
}
