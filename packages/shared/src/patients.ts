import { z } from 'zod';
import {
  doctorIdSchema,
  registryText,
  doctorQuerySchema,
  type DoctorDirectory,
} from './doctors.js';

export const patientInputSchema = z.strictObject({
  name: registryText('Patient name', 120),
  condition: registryText('Condition', 160),
});
export const patientUpdateSchema = patientInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide a name or condition to update.');
export const patientIdSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, 'This patient link is invalid.');
const patientQueryBase = z.strictObject({
  q: doctorQuerySchema.shape.q,
  condition: z.string().trim().min(1).max(160).optional(),
  doctorId: doctorIdSchema.optional(),
  from: doctorQuerySchema.shape.from,
  to: doctorQuerySchema.shape.to,
  page: doctorQuerySchema.shape.page,
  limit: doctorQuerySchema.shape.limit,
  sort: doctorQuerySchema.shape.sort,
});
const orderedDates = (value: { from?: string; to?: string }) =>
  !value.from || !value.to || value.from <= value.to;
export const patientQuerySchema = patientQueryBase.refine(orderedDates, {
  path: ['to'],
  message: 'End date must be on or after start date.',
});
// The nested URL is the only source of doctor scope.
export const scopedPatientQuerySchema = patientQueryBase
  .omit({ doctorId: true })
  .refine(orderedDates, { path: ['to'], message: 'End date must be on or after start date.' });
export type PatientInput = z.infer<typeof patientInputSchema>;
export type PatientUpdate = z.infer<typeof patientUpdateSchema>;
export type PatientQuery = z.infer<typeof patientQuerySchema>;
export type PatientDoctor = { id: string; name: string; specialization: string };
export type Patient = PatientInput & {
  id: string;
  doctorId: string;
  doctor: PatientDoctor;
  createdAt: string;
  updatedAt: string;
};
export type PatientDirectory = { items: Patient[]; pagination: DoctorDirectory['pagination'] };
