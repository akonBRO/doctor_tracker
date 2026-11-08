import { spawn } from 'node:child_process';
import { once } from 'node:events';

export default async function setup() {
  const api = spawn(process.execPath, ['--import', 'tsx', 'scripts/e2e-server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '';
  api.stdout!.on('data', (chunk) => {
    output += chunk.toString();
  });
  api.stderr!.on('data', (chunk) => {
    output += chunk.toString();
  });
  const message = await Promise.race([
    once(api, 'message').then(([value]) => value as { uri: string }),
    once(api, 'exit').then(() => {
      throw new Error(`Test API exited: ${output}`);
    }),
    new Promise<never>((_, reject) => {
      const timeout = setTimeout(() => reject(new Error('Test API startup timed out.')), 120000);
      timeout.unref();
    }),
  ]);
  process.env.E2E_MONGODB_URI = message.uri;
  const web = spawn(
    process.execPath,
    [
      '../../node_modules/next/dist/bin/next',
      process.env.E2E_WEB_MODE === 'development' ? 'dev' : 'start',
      '--hostname',
      '127.0.0.1',
    ],
    {
      cwd: 'apps/web',
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: process.env.E2E_WEB_MODE === 'development' ? 'development' : 'production',
        API_ORIGIN: 'http://127.0.0.1:4000',
        APP_ORIGIN: 'http://localhost:3000',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  );
  web.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  web.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  async function teardown() {
    web.kill();
    if (api.connected) {
      api.send('stop');
      await once(api, 'exit');
    }
  }
  try {
    for (let attempt = 0; attempt < 90; attempt++) {
      if (web.exitCode !== null) throw new Error(`Production web server exited: ${output}`);
      const ready = await fetch('http://localhost:3000')
        .then((result) => result.ok)
        .catch(() => false);
      if (ready) return teardown;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Production web server did not start: ${output}`);
  } catch (error) {
    await teardown();
    throw error;
  }
}
