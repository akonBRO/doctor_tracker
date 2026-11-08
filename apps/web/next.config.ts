import type { NextConfig } from 'next';
const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';
if (new URL(apiOrigin).origin !== apiOrigin || !/^https?:\/\//.test(apiOrigin))
  throw new Error('API_ORIGIN must be an HTTP(S) origin.');
const config: NextConfig = {
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
          ...(process.env.APP_ORIGIN?.startsWith('https://')
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
            : []),
        ],
      },
    ];
  },
};
export default config;
