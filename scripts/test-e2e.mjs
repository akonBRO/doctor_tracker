import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Each viewport/workflow is an independent real application/database fixture. Sharing
// analytics and CRUD suites consumed the same production IP budget in rapid automation.
// Keep the actual limits intact instead of adding a test-only authentication bypass.
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const args = process.argv.slice(2);
const projects = ['desktop', 'laptop', 'tablet', 'mobile', 'small-mobile'];
const projectsToRun = args.some((arg) => arg.startsWith('--project'))
  ? [args]
  : projects.map((project) => [...args, `--project=${project}`]);
const specs = ['tests/e2e/app.spec.ts', 'tests/e2e/dashboard.spec.ts'];
const groups = projectsToRun.flatMap((group) =>
  args.some((arg) => arg.includes('.spec.')) ? [group] : specs.map((spec) => [spec, ...group]),
);
for (const group of groups) {
  const child = spawn(process.execPath, [cli, 'test', ...group], { stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code !== 0) process.exit(typeof code === 'number' ? code : 1);
}
