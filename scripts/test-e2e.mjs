import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Each viewport is an independent real application/database fixture. Sharing one API
// made five full signup/MFA/recovery workflows consume the same production IP budget.
// Keep the actual limits intact instead of adding a test-only authentication bypass.
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const args = process.argv.slice(2);
const projects = ['desktop', 'laptop', 'tablet', 'mobile', 'small-mobile'];
const groups = args.some((arg) => arg.startsWith('--project'))
  ? [args]
  : projects.map((project) => [...args, `--project=${project}`]);
for (const group of groups) {
  const child = spawn(process.execPath, [cli, 'test', ...group], { stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code !== 0) process.exit(typeof code === 'number' ? code : 1);
}
