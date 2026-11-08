import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  doctorIdSchema,
  doctorInputSchema,
  doctorOptionsSchema,
  doctorQuerySchema,
} from '@doctor-tracker/shared';
import type { AuthService } from '../services/auth.js';
import { requireAdmin } from '../middleware/authorization.js';
import { rejectQueryParameters } from '../middleware/security.js';
import { createDoctor, doctorOptions, getDoctor, listDoctors } from '../services/doctors.js';
import { AppError } from '../utils/errors.js';

export function doctorRoutes(auth: AuthService) {
  const router = Router();
  router.use(requireAdmin(auth));
  router.post(
    '/',
    rejectQueryParameters,
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 60,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (_req, res) => res.locals.admin.id,
      handler(_req, _res, next) {
        next(
          new AppError(
            429,
            'RATE_LIMITED',
            'Too many records created. Please wait before trying again.',
          ),
        );
      },
    }),
    async (req, res) => {
      res.status(201).json({
        data: { doctor: await createDoctor(res.locals.admin, doctorInputSchema.parse(req.body)) },
      });
    },
  );
  router.get('/', async (req, res) => {
    res.json({ data: await listDoctors(res.locals.admin, doctorQuerySchema.parse(req.query)) });
  });
  router.get('/options', async (req, res) => {
    const query = doctorOptionsSchema.parse(req.query);
    res.json({ data: await doctorOptions(res.locals.admin, query.field, query.q) });
  });
  router.get('/:doctorId', rejectQueryParameters, async (req, res) => {
    res.json({
      data: await getDoctor(res.locals.admin, doctorIdSchema.parse(req.params.doctorId)),
    });
  });
  return router;
}
