import { z } from 'zod';
import { BANGLADESH_DISTRICTS, BANGLADESH_DIVISIONS, patientMobileSchema } from './bangladesh.js';
import {
  doctorIdSchema,
  registryText,
  doctorQuerySchema,
  type DoctorDirectory,
} from './doctors.js';

export const PATIENT_GENDERS = [
  'female',
  'male',
  'non-binary',
  'other',
  'prefer-not-to-say',
  'unknown',
] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] as const;
export const EMERGENCY_RELATIONSHIPS = [
  'Parent',
  'Spouse',
  'Child',
  'Sibling',
  'Guardian',
  'Relative',
  'Other',
] as const;
export const ALLERGY_STATUSES = ['unknown', 'none-known', 'known'] as const;
export const AGE_UNITS = ['years', 'months', 'days'] as const;

const optionalText = (label: string, max: number) => registryText(label, max).nullable().optional();
const clinicalText = (label: string, max: number) =>
  z
    .string()
    .max(max + 100)
    .transform((value) => value.trim().normalize('NFKC').replace(/\r\n?/g, '\n'))
    .pipe(
      z
        .string()
        .min(1, `Enter ${label.toLowerCase()}.`)
        .max(max, `Use at most ${max} characters.`)
        .refine(
          (value) =>
            Array.from(value).every(
              (char) =>
                char === '\n' ||
                char === '\t' ||
                (char.codePointAt(0)! >= 32 && char.codePointAt(0) !== 127),
            ),
          'Remove unsupported control characters.',
        ),
    )
    .nullable()
    .optional();

export function bangladeshToday(now = new Date()) {
  return new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a valid date of birth.')
  .refine(
    (value) => value >= '1900-01-01' && value <= bangladeshToday(),
    'Date of birth must be between 1900 and today.',
  );
const approximateAgeSchema = z
  .strictObject({
    value: z.number().int().min(0),
    unit: z.enum(AGE_UNITS),
  })
  .refine(({ value, unit }) => value <= { years: 120, months: 1439, days: 43830 }[unit], {
    path: ['value'],
    message: 'Enter a realistic approximate age (at most 120 years).',
  });
const emergencyContactSchema = z
  .strictObject({
    name: registryText('Contact name', 120),
    relationship: z.enum(EMERGENCY_RELATIONSHIPS),
    mobile: patientMobileSchema,
    relationshipOther: optionalText('Relationship details', 80),
  })
  .refine((value) => value.relationship === 'Other' || !value.relationshipOther, {
    path: ['relationshipOther'],
    message: 'Only provide relationship details for Other.',
  });

const patientFieldsSchema = z.strictObject({
  name: registryText('Patient name', 120),
  condition: registryText('Condition', 160),
  nameBangla: optionalText('Bangla name', 120),
  dateOfBirth: birthDateSchema.nullable().optional(),
  approximateAge: approximateAgeSchema.nullable().optional(),
  gender: z.enum(PATIENT_GENDERS).nullable().optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
  mobile: patientMobileSchema.nullable().optional(),
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email({ error: 'Enter a valid email address.' }))
    .transform((value) => value.toLowerCase())
    .nullable()
    .optional(),
  division: z.enum(BANGLADESH_DIVISIONS).nullable().optional(),
  district: optionalText('District', 60),
  upazila: optionalText('Upazila / Thana', 100),
  addressLine: optionalText('Address', 300),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter a four-digit Bangladesh postal code.')
    .nullable()
    .optional(),
  emergencyContact: emergencyContactSchema.nullable().optional(),
  chiefComplaint: clinicalText('Chief complaint', 1000),
  allergyStatus: z.enum(ALLERGY_STATUSES).nullable().optional(),
  allergies: clinicalText('Allergies', 1000),
  medicalHistory: clinicalText('Medical history', 2000),
  currentMedications: clinicalText('Current medications', 1000),
  clinicalNotes: clinicalText('Clinical notes', 2000),
});
export const PATIENT_RECORD_FIELDS = Object.keys(patientFieldsSchema.shape) as (keyof z.infer<
  typeof patientFieldsSchema
>)[];
function validateGroups(value: Partial<z.infer<typeof patientFieldsSchema>>, ctx: z.RefinementCtx) {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  if (value.dateOfBirth && value.approximateAge)
    issue('approximateAge', 'Use either date of birth or approximate age, not both.');
  if (
    !!value.division !== !!value.district ||
    (value.division &&
      value.district &&
      !BANGLADESH_DISTRICTS[value.division]?.includes(value.district))
  )
    issue('district', 'Select a district belonging to the selected division.');
  if (value.allergyStatus === 'known' && !value.allergies)
    issue('allergies', 'Record the known allergies.');
  if (value.allergies && value.allergyStatus !== 'known')
    issue('allergyStatus', 'Select Known allergies when recording allergy details.');
}
// Existing records have no invented demographics or medical defaults.
export const patientRecordSchema = patientFieldsSchema.superRefine(validateGroups);
export const patientInputSchema = patientFieldsSchema
  .extend({
    mobile: patientMobileSchema,
    gender: z.enum(PATIENT_GENDERS),
  })
  .superRefine(validateGroups)
  .refine((value) => !!value.dateOfBirth || !!value.approximateAge, {
    path: ['dateOfBirth'],
    message: 'Enter date of birth or an explicitly approximate age.',
  });
export const patientUpdateSchema = patientFieldsSchema.partial().superRefine((value, ctx) => {
  validateGroups(value, ctx);
  if (!Object.keys(value).length)
    ctx.addIssue({ code: 'custom', message: 'Provide a patient field to update.' });
  // Related fields are updated together atomically, avoiding cross-field races.
  for (const [a, b] of [
    ['dateOfBirth', 'approximateAge'],
    ['division', 'district'],
    ['allergyStatus', 'allergies'],
  ] as const) {
    if (a in value !== b in value)
      ctx.addIssue({
        code: 'custom',
        path: [b],
        message: `Provide ${a} and ${b} together; use null to clear.`,
      });
  }
});

export function patientAgeLabel(
  patient: Pick<PatientRecord, 'dateOfBirth' | 'approximateAge'>,
  now = new Date(),
) {
  if (patient.dateOfBirth) {
    const today = bangladeshToday(now);
    let years = Number(today.slice(0, 4)) - Number(patient.dateOfBirth.slice(0, 4));
    if (today.slice(5) < patient.dateOfBirth.slice(5)) years--;
    if (years >= 1) return `${years} ${years === 1 ? 'year' : 'years'}`;
    let months =
      (Number(today.slice(0, 4)) - Number(patient.dateOfBirth.slice(0, 4))) * 12 +
      Number(today.slice(5, 7)) -
      Number(patient.dateOfBirth.slice(5, 7));
    if (today.slice(8) < patient.dateOfBirth.slice(8)) months--;
    if (months >= 1) return `${months} ${months === 1 ? 'month' : 'months'}`;
    const days = Math.max(
      0,
      Math.floor((Date.parse(today) - Date.parse(patient.dateOfBirth)) / 86400000),
    );
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (patient.approximateAge) {
    const { value, unit } = patient.approximateAge;
    return `Approximately ${value} ${value === 1 ? unit.slice(0, -1) : unit}`;
  }
  return 'Age not recorded';
}
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
export type PatientRecord = z.infer<typeof patientRecordSchema>;
export type PatientUpdate = z.infer<typeof patientUpdateSchema>;
export type PatientQuery = z.infer<typeof patientQuerySchema>;
export type PatientDoctor = { id: string; name: string; specialization: string };
export type Patient = PatientRecord & {
  id: string;
  doctorId: string;
  doctor: PatientDoctor;
  createdAt: string;
  updatedAt: string;
};
export type PatientDirectory = { items: Patient[]; pagination: DoctorDirectory['pagination'] };
