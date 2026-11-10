// Source-package preparation only. No SSH, service control, DNS, credentials or deployment.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const value = (key) => (args.includes(key) ? args[args.indexOf(key) + 1] : undefined);
const revision = value('--commit');
if (!revision || !/^[a-f0-9]{40}$/.test(revision))
  throw new Error('An explicit full release commit SHA is required.');
const root = value('--repo')
  ? resolve(value('--repo'))
  : fileURLToPath(new URL('../', import.meta.url));
const output = value('--out') && resolve(value('--out'));
if (!output) throw new Error('An explicit local output directory is required.');
const git = (...parameters) =>
  execFileSync('git', ['-C', root, ...parameters], { encoding: 'utf8', windowsHide: true }).trim();
if (git('rev-parse', `${revision}^{commit}`) !== revision)
  throw new Error('Unknown release commit.');
const tree = git('ls-tree', '-r', revision).split('\n').filter(Boolean);
for (const entry of tree) {
  const [metadata, name] = entry.split('\t');
  if (!name || metadata.startsWith('120000') || metadata.startsWith('160000'))
    throw new Error('Release symlinks/submodules require separate review.');
  if (
    name
      .split('/')
      .some((part) =>
        [
          'node_modules',
          '.next',
          '.next-e2e',
          'dist',
          'tmp',
          '.local',
          'test-results',
          'playwright-report',
        ].includes(part),
      )
  )
    throw new Error('Tracked generated/runtime artifacts block source packaging.');
  if (
    (/(^|\/)(?:\.env(?:\..*)?|[^/]*\.env(?:\..*)?)$/.test(name) &&
      !name.endsWith('.env.example')) ||
    /\.(?:key|pem|p12|pfx)$/i.test(name)
  )
    throw new Error('A tracked private configuration/key filename blocks packaging.');
}
await mkdir(output, { recursive: true });
const archiveName = `doctor-tracker-${revision}.tar.gz`;
const archivePath = join(output, archiveName);
// Exclusive output avoids overwriting a previously reviewed release artifact.
await writeFile(
  archivePath,
  execFileSync(
    'git',
    ['-C', root, 'archive', '--format=tar.gz', `--prefix=doctor-tracker-${revision}/`, revision],
    { maxBuffer: 100 * 1024 * 1024, windowsHide: true },
  ),
  { flag: 'wx' },
);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = {
  format: 1,
  kind: 'source-release',
  commit: revision,
  commitTime: git('show', '-s', '--format=%cI', revision),
  lockfileSha256: sha256(
    execFileSync('git', ['-C', root, 'show', `${revision}:package-lock.json`], {
      windowsHide: true,
    }),
  ),
  archive: archiveName,
  archiveSha256: sha256(await readFile(archivePath)),
  deploymentAuthorized: false,
  note: 'Build on the approved Linux target with pinned lockfile and approved origins. No secrets or node_modules are included. This manifest is not deployment approval.',
};
await writeFile(join(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
  flag: 'wx',
});
await writeFile(join(output, 'SHA256SUMS'), `${manifest.archiveSha256}  ${archiveName}\n`, {
  flag: 'wx',
});
process.stdout.write(`Prepared source release ${revision}; deployment remains unauthorized.\n`);
