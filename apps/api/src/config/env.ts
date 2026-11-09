import { z } from 'zod';

const secret = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Generate a 32-byte random hexadecimal secret.')
  .refine((value) => new Set(value).size >= 10, 'Secret is not sufficiently varied.');
const origin = z.url().refine((value) => {
  try {
    return /^https?:\/\//.test(value) && new URL(value).origin === value;
  } catch {
    return false;
  }
}, 'Use an origin without a path or trailing slash.');
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1', '::']).default('127.0.0.1'),
    WEB_ORIGIN: origin,
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
    JWT_SECRET: secret,
    MFA_ENCRYPTION_KEY: secret,
    CSRF_SECRET: secret,
    ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(15).default(5),
    REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    COOKIE_SECURE: z.enum(['true', 'false']).transform((value) => value === 'true'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
    API_INSTANCE_COUNT: z.coerce.number().int().min(1).max(1).default(1),
    WEB_CONCURRENCY: z.enum(['1']).optional(),
    NODE_APP_INSTANCE: z.never().optional(),
    NODE_TLS_REJECT_UNAUTHORIZED: z.enum(['1']).optional(),
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
    if (env.NODE_ENV === 'production') {
      if (!/^mongodb(?:\+srv)?:\/\/[^/?#]+\/[^/?#]+(?:\?|$)/.test(env.MONGODB_URI))
        ctx.addIssue({
          code: 'custom',
          path: ['MONGODB_URI'],
          message: 'Production requires an explicit database name.',
        });
      const options = new URLSearchParams(env.MONGODB_URI.split('?')[1] ?? '');
      const values = new Map<string, string[]>();
      for (const [key, value] of options) {
        const normalized = key.toLowerCase();
        values.set(normalized, [...(values.get(normalized) ?? []), value.toLowerCase()]);
      }
      const disabled = (key: string) => values.get(key)?.some((value) => value !== 'true');
      const unsafe = [
        'tlsinsecure',
        'tlsallowinvalidcertificates',
        'tlsallowinvalidhostnames',
      ].some((key) => values.get(key)?.some((value) => value !== 'false'));
      const tls =
        env.MONGODB_URI.startsWith('mongodb+srv://') ||
        values.get('tls')?.includes('true') ||
        values.get('ssl')?.includes('true');
      if (!tls || disabled('tls') || disabled('ssl') || unsafe)
        ctx.addIssue({
          code: 'custom',
          path: ['MONGODB_URI'],
          message: 'Production requires verified MongoDB TLS.',
        });
    }
  });
export type Config = z.infer<typeof schema>;
export class ConfigurationError extends Error {
  constructor(
    public fields: string[],
    message: string,
  ) {
    super(message);
  }
}
export function loadConfig(input: NodeJS.ProcessEnv = process.env): Config {
  if (input.NODE_ENV === 'production') {
    const missing = ['TRUST_PROXY_HOPS', 'API_INSTANCE_COUNT'].filter(
      (key) => input[key] === undefined,
    );
    if (missing.length)
      throw new ConfigurationError(missing, `Production requires explicit ${missing.join(', ')}.`);
  }
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ConfigurationError(
      [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'productionPolicy')))],
      `Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  return result.data;
}
