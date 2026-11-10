import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { isIP } from 'node:net';

const root = fileURLToPath(new URL('../../', import.meta.url));
export async function caddyBinary(platform = process.platform) {
  const release = JSON.parse(await readFile(join(root, 'deploy/caddy-release.json'), 'utf8')) as {
    version: string;
  };
  return join(
    root,
    'tmp/tools/caddy',
    release.version,
    platform,
    platform === 'win32' ? 'caddy.exe' : 'caddy',
  );
}
export async function renderCaddy(options: {
  origin: string;
  email?: string;
  httpPort?: number;
  webUpstream?: string;
  certificate?: { cert: string; key: string };
}) {
  const origin = new URL(options.origin);
  if (origin.protocol !== 'https:' || origin.origin !== options.origin)
    throw new Error('An exact HTTPS origin is required.');
  const fixture = Boolean(options.certificate);
  if (fixture && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
    throw new Error('Fixture certificates are restricted to loopback.');
  if (
    !fixture &&
    (isIP(origin.hostname.replaceAll('[', '').replaceAll(']', '')) ||
      origin.port ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(origin.hostname) ||
      origin.hostname.endsWith('.test'))
  )
    throw new Error('Production rendering requires an approved public hostname on port 443.');
  if (
    !fixture &&
    (!options.email ||
      !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(options.email))
  )
    throw new Error('An approved certificate-renewal contact is required.');
  const upstream = options.webUpstream ?? '127.0.0.1:3000';
  if (
    !/^127\.0\.0\.1:\d{1,5}$/.test(upstream) ||
    Number(upstream.split(':')[1]) > 65535 ||
    Number(upstream.split(':')[1]) < 1
  )
    throw new Error('The native topology requires a loopback upstream.');
  const httpPort = options.httpPort ?? 80;
  if (
    !Number.isInteger(httpPort) ||
    httpPort < 1 ||
    httpPort > 65535 ||
    (!fixture && httpPort !== 80)
  )
    throw new Error('Invalid HTTP listener port.');
  const httpAuthorities =
    httpPort === 80
      ? [origin.hostname, `${origin.hostname}:80`]
      : [`${origin.hostname}:${httpPort}`];
  const httpsAuthorities = origin.port
    ? [origin.host]
    : [origin.hostname, `${origin.hostname}:443`];
  const expression = (authorities: string[]) =>
    authorities
      .map((authority) => `{http.request.hostport} == ${JSON.stringify(authority)}`)
      .join(' || ');
  const tls = options.certificate
    ? `tls ${JSON.stringify(resolve(options.certificate.cert).replaceAll('\\', '/'))} ${JSON.stringify(resolve(options.certificate.key).replaceAll('\\', '/'))}`
    : `tls ${JSON.stringify(options.email)}`;
  const replacements: Record<string, string> = {
    HTTP_PORT: String(httpPort),
    HTTP_HOST_EXPRESSION: expression(httpAuthorities),
    HTTPS_ORIGIN: origin.origin,
    HTTPS_PORT: origin.port || '443',
    HTTPS_HOST_EXPRESSION: `!(${expression(httpsAuthorities)})`,
    TLS_DIRECTIVE: tls,
    WEB_UPSTREAM: upstream,
    HTTPS_AUTHORITY: origin.host,
  };
  const template = await readFile(join(root, 'deploy/templates/Caddyfile'), 'utf8');
  return template.replace(/__([A-Z_]+)__/g, (_match, name: string) => replacements[name]!);
}
