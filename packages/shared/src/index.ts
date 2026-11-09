import { z } from 'zod';
export * from './doctors.js';
export * from './patients.js';
export * from './bangladesh.js';

export const emailSchema = z
  .email({ error: 'Enter a valid email address.' })
  .max(254)
  .transform((value) => value.toLowerCase());
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(128, 'Use at most 128 characters.')
  .refine(
    (value) => /[a-zA-Z]/.test(value) && /[^a-zA-Z]/.test(value),
    'Include a letter and a number or symbol.',
  );
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(128, 'Use at most 128 characters.'),
});
export const signupSchema = z.strictObject({
  name: z.string().trim().min(2, 'Enter your full name.').max(80, 'Use at most 80 characters.'),
  email: emailSchema,
  password: passwordSchema,
  invitation: z.string().regex(/^[a-f0-9]{64}$/),
});
export const totpSchema = z.strictObject({
  code: z.string().regex(/^\d{6}$/, 'Enter the six-digit code from your authenticator.'),
});
export const recoverySchema = z.strictObject({
  code: z.string().regex(/^[a-f0-9]{16}$/, 'Enter a valid recovery code.'),
});
export type AdminIdentity = { id: string; name: string; email: string; role: 'admin' };
export type AuthStep = { step: 'enroll' | 'verify' };
export type AuthResponse = { admin: AdminIdentity; recoveryCodes?: string[] };
export type ApiEnvelope<T> = { data: T };
export type ApiErrorBody = {
  error: { code: string; message: string; fields?: Record<string, string[]>; requestId?: string };
};
