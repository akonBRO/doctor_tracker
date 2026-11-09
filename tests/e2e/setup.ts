import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';

const webOrigin = 'http://127.0.0.1:3100';
const apiOrigin = 'http://127.0.0.1:4100';

async function requireFreePort(port: number) {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', () =>
      reject(
        new Error(`Browser-test port ${port} is occupied. Refusing to reuse an existing server.`),
      ),
    );
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      probe.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

async function stopOwnedTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  if (process.platform === 'win32') {
    // next dev may own a server child. Target only the PID created by this fixture.
    const kill = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    await once(kill, 'exit');
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  await exited;
}

async function stopOwnedApi(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (!child.connected) return stopOwnedTree(child);
  const exited = once(child, 'exit').then(() => true);
  child.send('stop', () => undefined);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const stopped = await Promise.race([
    exited,
    new Promise<false>((resolve) => {
      timeout = setTimeout(() => resolve(false), 10000);
    }),
  ]);
  clearTimeout(timeout);
  if (!stopped) await stopOwnedTree(child);
}

export default async function setup() {
  if (process.env.E2E_WEB_MODE !== 'development') {
    const manifest = JSON.parse(readFileSync('apps/web/.next/routes-manifest.json', 'utf8')) as {
      rewrites: {
        beforeFiles?: { source: string; destination: string }[];
        afterFiles?: { source: string; destination: string }[];
        fallback?: { source: string; destination: string }[];
      };
    };
    const rewrites = [
      ...(manifest.rewrites.beforeFiles ?? []),
      ...(manifest.rewrites.afterFiles ?? []),
      ...(manifest.rewrites.fallback ?? []),
    ];
    if (
      !rewrites.some(
        (rewrite) =>
          rewrite.source === '/api/v1/:path*' &&
          rewrite.destination === `${apiOrigin}/api/v1/:path*`,
      )
    )
      throw new Error(
        `Browser tests require a web build with API_ORIGIN=${apiOrigin}. Refusing to call another database environment.`,
      );
  }
  await Promise.all([requireFreePort(3100), requireFreePort(4100)]);
  const api = spawn(process.execPath, ['--import', 'tsx', 'scripts/e2e-server.ts'], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  let output = '';
  api.stdout!.on('data', (chunk) => {
    output += chunk.toString();
  });
  api.stderr!.on('data', (chunk) => {
    output += chunk.toString();
  });
  let message: { uri: string; fixtureId: string };
  let startupTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    message = await Promise.race([
      once(api, 'message').then(([value]) => value as { uri: string; fixtureId: string }),
      once(api, 'exit').then(() => {
        throw new Error(`Test API exited: ${output}`);
      }),
      new Promise<never>((_, reject) => {
        startupTimeout = setTimeout(() => reject(new Error('Test API startup timed out.')), 120000);
      }),
    ]);
  } catch (error) {
    await stopOwnedApi(api);
    throw error;
  } finally {
    clearTimeout(startupTimeout);
  }
  process.env.E2E_MONGODB_URI = message.uri;
  const web = spawn(
    process.execPath,
    [
      '../../node_modules/next/dist/bin/next',
      process.env.E2E_WEB_MODE === 'development' ? 'dev' : 'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3100',
    ],
    {
      cwd: 'apps/web',
      stdio: 'pipe',
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        NODE_ENV: process.env.E2E_WEB_MODE === 'development' ? 'development' : 'production',
        API_ORIGIN: apiOrigin,
        APP_ORIGIN: webOrigin,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  );
  let webReady = false;
  web.stdout.on('data', (chunk) => {
    const message = chunk.toString();
    output += message;
    if (/Ready in/.test(output)) webReady = true;
  });
  web.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  async function teardown() {
    try {
      await stopOwnedTree(web);
    } finally {
      await stopOwnedApi(api);
    }
  }
  try {
    for (let attempt = 0; attempt < 90; attempt++) {
      if (api.exitCode !== null || api.signalCode !== null)
        throw new Error(`Test API exited: ${output}`);
      if (web.exitCode !== null || web.signalCode !== null)
        throw new Error(`Test web server exited: ${output}`);
      if (webReady) {
        const ready = await fetch(webOrigin, { signal: AbortSignal.timeout(5000) })
          .then((result) => result.ok)
          .catch(() => false);
        if (ready) {
          const health = await fetch(`${webOrigin}/api/v1/health`, {
            signal: AbortSignal.timeout(5000),
          });
          if (!health.ok || health.headers.get('X-Doctor-Tracker-E2E') !== message.fixtureId)
            throw new Error('Test web server is not connected to its own isolated API fixture.');
          if (web.exitCode !== null || api.exitCode !== null)
            throw new Error(`A test process exited during startup: ${output}`);
          return teardown;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Test web server did not start: ${output}`);
  } catch (error) {
    await teardown();
    throw error;
  }
}
