import { z } from 'zod';

export const normalizeDoctorText = (value: string) =>
  value.trim().normalize('NFKC').replace(/\s+/gu, ' ');
export const doctorKey = (value: string) => normalizeDoctorText(value).toLowerCase();
export const doctorWords = (value: string) => doctorKey(value).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
const text = (label: string, max: number) =>
  z
    .string()
    .max(max + 100, `${label} is too long.`)
    .transform(normalizeDoctorText)
    .pipe(
      z
        .string()
        .min(1, `Enter ${label.toLowerCase()}.`)
        .max(max, `Use at most ${max} characters.`)
        .refine((value) => /[\p{L}\p{N}]/u.test(value), `${label} must contain a letter or number.`)
        .refine(
          (value) =>
            Array.from(value).every(
              (char) => char.codePointAt(0)! >= 32 && char.codePointAt(0) !== 127,
            ),
          'Remove unsupported control characters.',
        ),
    );
export const doctorInputSchema = z.strictObject({
  name: text('Doctor name', 120),
  specialization: text('Specialization', 100),
  hospital: text('Hospital name', 160),
  phone: z
    .string()
    .trim()
    .max(40, 'Use at most 40 characters.')
    .refine(
      (value) =>
        /^\+?\d[\d ().-]*\d$/u.test(value) &&
        (value.match(/\d/g)?.length ?? 0) >= 7 &&
        (value.match(/\d/g)?.length ?? 0) <= 15 &&
        (value.match(/\(/g)?.length ?? 0) === (value.match(/\)/g)?.length ?? 0),
      'Enter 7–15 digits, with an optional country code and spaces, brackets, dots or hyphens.',
    ),
  email: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email({ error: 'Enter a valid email address.' }))
    .transform((value) => value.toLowerCase()),
});
export const doctorIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'This doctor link is invalid.');
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Enter a valid calendar date.');
export const doctorSortSchema = z.enum(['newest', 'oldest', 'name-asc', 'name-desc']);
export const doctorQuerySchema = z
  .strictObject({
    q: z
      .string()
      .trim()
      .max(120, 'Use at most 120 search characters.')
      .refine((value) => doctorWords(value).length <= 5, 'Search with at most five words.')
      .optional(),
    specialization: z.string().trim().min(1).max(100).transform(normalizeDoctorText).optional(),
    hospital: z.string().trim().min(1).max(160).transform(normalizeDoctorText).optional(),
    from: date.optional(),
    to: date.optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    sort: doctorSortSchema.default('newest'),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'End date must be on or after start date.',
  });
export const doctorOptionsSchema = z.strictObject({
  field: z.enum(['specialization', 'hospital']),
  q: z.string().trim().max(160).default(''),
});
export type DoctorInput = z.infer<typeof doctorInputSchema>;
export type DoctorQuery = z.infer<typeof doctorQuerySchema>;
export type Doctor = DoctorInput & { id: string; createdAt: string; updatedAt: string };
export type DoctorDirectory = {
  items: Doctor[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};
export type DoctorOptions = { values: string[]; hasMore: boolean };
