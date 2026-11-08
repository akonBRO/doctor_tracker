import { z } from 'zod';

const secret = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Generate a 32-byte random hexadecimal secret.')
  .refine((value) => new Set(value).size >= 10, 'Secret is not sufficiently varied.');
const origin = z
  .url()
  .refine(
    (value) => new URL(value).origin === value,
    'Use an origin without a path or trailing slash.',
  );
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    WEB_ORIGIN: origin,
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
    JWT_SECRET: secret,
    MFA_ENCRYPTION_KEY: secret,
    CSRF_SECRET: secret,
    ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(15).default(5),
    REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    COOKIE_SECURE: z.enum(['true', 'false']).transform((value) => value === 'true'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  })
  .superRefine((env, ctx) => {
    if (new Set([env.JWT_SECRET, env.MFA_ENCRYPTION_KEY, env.CSRF_SECRET]).size !== 3)
      ctx.addIssue({
        code: 'custom',
        message: 'Use independent secrets for signing, encryption, and CSRF.',
      });
    if (
      env.NODE_ENV === 'production' &&
      (!env.COOKIE_SECURE || !env.WEB_ORIGIN.startsWith('https://'))
    )
      ctx.addIssue({ code: 'custom', message: 'Production requires HTTPS and secure cookies.' });
  });
export type Config = z.infer<typeof schema>;
export function loadConfig(input: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  return result.data;
}
