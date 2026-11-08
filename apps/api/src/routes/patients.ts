import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  doctorIdSchema,
  patientIdSchema,
  patientInputSchema,
  patientUpdateSchema,
  patientQuerySchema,
  scopedPatientQuerySchema,
} from '@doctor-tracker/shared';
import type { AuthService } from '../services/auth.js';
import { requireAdmin } from '../middleware/authorization.js';
import { rejectQueryParameters } from '../middleware/security.js';
import {
  createPatient,
  listPatients,
  getPatient,
  updatePatient,
  deletePatient,
} from '../services/patients.js';
import { AppError } from '../utils/errors.js';

export function patientRoutes(auth: AuthService) {
  const router = Router();
  router.use(['/patients', '/doctors/:doctorId/patients'], requireAdmin(auth));
  const mutations = rateLimit({
    windowMs: 15 * 60_000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_req, res) => res.locals.admin.id,
    handler: (_req, _res, next) =>
      next(
        new AppError(
          429,
          'RATE_LIMITED',
          'Too many record changes. Please wait before trying again.',
        ),
      ),
  });
  router.get('/patients', async (req, res) =>
    res.json({ data: await listPatients(res.locals.admin, patientQuerySchema.parse(req.query)) }),
  );
  router.get('/patients/:patientId', rejectQueryParameters, async (req, res) =>
    res.json({
      data: await getPatient(res.locals.admin, patientIdSchema.parse(req.params.patientId)),
    }),
  );
  router.patch('/patients/:patientId', rejectQueryParameters, mutations, async (req, res) =>
    res.json({
      data: await updatePatient(
        res.locals.admin,
        patientIdSchema.parse(req.params.patientId),
        patientUpdateSchema.parse(req.body),
      ),
    }),
  );
  router.delete('/patients/:patientId', rejectQueryParameters, mutations, async (req, res) => {
    patientInputSchema.pick({}).parse(req.body);
    res.json({
      data: await deletePatient(res.locals.admin, patientIdSchema.parse(req.params.patientId)),
    });
  });
  router.get('/doctors/:doctorId/patients', async (req, res) =>
    res.json({
      data: await listPatients(
        res.locals.admin,
        scopedPatientQuerySchema.parse(req.query),
        doctorIdSchema.parse(req.params.doctorId),
      ),
    }),
  );
  router.post('/doctors/:doctorId/patients', rejectQueryParameters, mutations, async (req, res) =>
    res.status(201).json({
      data: await createPatient(
        res.locals.admin,
        doctorIdSchema.parse(req.params.doctorId),
        patientInputSchema.parse(req.body),
      ),
    }),
  );
  router.delete(
    '/doctors/:doctorId/patients/:patientId',
    rejectQueryParameters,
    mutations,
    async (req, res) => {
      patientInputSchema.pick({}).parse(req.body);
      res.json({
        data: await deletePatient(
          res.locals.admin,
          patientIdSchema.parse(req.params.patientId),
          doctorIdSchema.parse(req.params.doctorId),
        ),
      });
    },
  );
  return router;
}
