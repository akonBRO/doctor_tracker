import { expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { randomToken } from '../utils/security.js';
import { logger } from '../utils/logger.js';

it('classifies a rejected authentication request without logging credentials, clinical input or URLs', async () => {
  const app = await createApp(
    loadConfig({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:1/disconnected',
      WEB_ORIGIN: 'http://localhost:3000',
      COOKIE_SECURE: 'false',
      JWT_SECRET: randomToken(),
      MFA_ENCRYPTION_KEY: randomToken(),
      CSRF_SECRET: randomToken(),
    }),
  );
  const warn = vi.spyOn(logger, 'warn');
  try {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'DO_NOT_LOG_PASSWORD', condition: 'DO_NOT_LOG_CLINICAL' });
    expect(response.status).toBe(403);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'authentication_rejected',
        action: 'login',
        code: 'ORIGIN_REJECTED',
        status: 403,
      }),
    );
    const encoded = JSON.stringify(warn.mock.calls);
    expect(encoded).not.toMatch(/DO_NOT_LOG|\/api\/|password|condition|cookie/i);
    expect(Object.keys(warn.mock.calls[0]![0] as object).sort()).toEqual([
      'action',
      'code',
      'event',
      'requestId',
      'status',
    ]);
  } finally {
    warn.mockRestore();
  }
});
