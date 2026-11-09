export function loadWebConfig(input: Readonly<Record<string, string | undefined>> = process.env) {
  const production = input.NODE_ENV === 'production';
  const apiOrigin = input.API_ORIGIN ?? (production ? '' : 'http://127.0.0.1:4000');
  const appOrigin = input.APP_ORIGIN ?? (production ? '' : 'http://localhost:3000');
  const validOrigin = (value: string) => {
    try {
      return /^https?:\/\//.test(value) && new URL(value).origin === value;
    } catch {
      return false;
    }
  };
  const invalid: string[] = [];
  if (!validOrigin(apiOrigin)) invalid.push('API_ORIGIN');
  if (!validOrigin(appOrigin)) invalid.push('APP_ORIGIN');
  if (input.NODE_TLS_REJECT_UNAUTHORIZED === '0') invalid.push('NODE_TLS_REJECT_UNAUTHORIZED');
  if (input.WEB_ALLOW_LOCAL_HTTP && !['true', 'false'].includes(input.WEB_ALLOW_LOCAL_HTTP))
    invalid.push('WEB_ALLOW_LOCAL_HTTP');
  const local = (value: string) =>
    validOrigin(value) && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname);
  const localHttp = input.WEB_ALLOW_LOCAL_HTTP === 'true' && local(appOrigin) && local(apiOrigin);
  if (production && !appOrigin.startsWith('https://') && !localHttp) invalid.push('APP_ORIGIN');
  if (production && input.WEB_ALLOW_LOCAL_HTTP === 'true' && !localHttp)
    invalid.push('WEB_ALLOW_LOCAL_HTTP');
  if (invalid.length)
    throw new Error(
      `Invalid web configuration: ${[...new Set(invalid)].join(', ')}. Production requires explicit origins and HTTPS; local HTTP requires explicit loopback-only opt-in.`,
    );
  return { apiOrigin, appOrigin };
}

export function assertBuiltApiOrigin(manifest: unknown, apiOrigin: string, appOrigin?: string) {
  const rewrites = (
    manifest as { rewrites?: Record<string, { source: string; destination: string }[]> }
  )?.rewrites;
  const routes = Object.values(rewrites ?? {}).flat();
  if (
    !routes.some(
      (route) =>
        route.source === '/api/v1/:path*' && route.destination === `${apiOrigin}/api/v1/:path*`,
    )
  )
    throw new Error(
      'API_ORIGIN differs from the built API rewrite. Rebuild with the intended release configuration.',
    );
  if (appOrigin) {
    const headers =
      (manifest as { headers?: { headers: { key: string; value: string }[] }[] }).headers ?? [];
    const builtHttps = headers.some((route) =>
      route.headers.some((header) => header.key.toLowerCase() === 'strict-transport-security'),
    );
    if (builtHttps !== appOrigin.startsWith('https://'))
      throw new Error(
        'APP_ORIGIN transport differs from the built security headers. Rebuild with the intended release configuration.',
      );
  }
}
