import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Route types do not start a server or produce a deployable build. Next's CLI
// otherwise defaults typegen to production, requiring release origins for local tsc.
// Scope development mode to this child; build/start retain production validation.
const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)), 'typegen'],
  {
    cwd: fileURLToPath(new URL('../apps/web', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'inherit',
    windowsHide: true,
  },
);
if (result.error) process.stderr.write('Route type generation could not start.\n');
process.exit(result.status ?? 1);
