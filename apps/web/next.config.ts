import type { NextConfig } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebConfig, assertBuiltApiOrigin } from './config/environment';

export default function configure(phase: string): NextConfig {
  const { apiOrigin, appOrigin } = loadWebConfig();
  const distDir = process.env.E2E_WEB_MODE === 'development' ? '.next-e2e' : '.next';
  if (phase === 'phase-production-server')
    assertBuiltApiOrigin(
      JSON.parse(readFileSync(join(process.cwd(), distDir, 'routes-manifest.json'), 'utf8')),
      apiOrigin,
      appOrigin,
    );
  return {
    distDir: process.env.E2E_WEB_MODE === 'development' ? '.next-e2e' : '.next',
    poweredByHeader: false,
    productionBrowserSourceMaps: false,
    async rewrites() {
      return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
    },
    async headers() {
      return [
        {
          source: '/:path*',
          headers: [
            { key: 'Referrer-Policy', value: 'no-referrer' },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
            ...(appOrigin.startsWith('https://')
              ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
              : []),
          ],
        },
      ];
    },
  };
}
