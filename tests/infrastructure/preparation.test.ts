import { expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderCaddy } from '../../scripts/lib/infrastructure.js';

it('renders a canonical private topology with bounded bodies and sanitized logs', async () => {
  const text = await renderCaddy({
    origin: 'https://approved.example.com',
    email: 'owner@example.com',
  });
  expect(text).not.toContain('__');
  for (const directive of [
    'admin off',
    'request delete',
    'resp_headers delete',
    'max_size 64KiB',
    'header_up -Forwarded',
    'header_up X-Forwarded-For {remote_host}',
    'reverse_proxy 127.0.0.1:3000',
  ])
    expect(text).toContain(directive);
});
it.each([
  'http://approved.example.com',
  'https://approved.example.com/path',
  'https://127.0.0.1',
  'https://approved.example.test',
  'https://approved.example.com:8443',
])('rejects incomplete/unapproved production topology input: %s', async (origin) => {
  await expect(renderCaddy({ origin, email: 'owner@example.com' })).rejects.toThrow();
});
it('requires a contact and refuses public-network or injected upstreams', async () => {
  await expect(renderCaddy({ origin: 'https://approved.example.com' })).rejects.toThrow();
  await expect(
    renderCaddy({
      origin: 'https://approved.example.com',
      email: 'owner@example.com',
      webUpstream: '0.0.0.0:3000',
    }),
  ).rejects.toThrow();
  await expect(
    renderCaddy({
      origin: 'https://approved.example.com',
      email: 'owner@example.com\nadmin localhost:2019',
    }),
  ).rejects.toThrow();
});
it('does not allow fixture certificates on a public host', async () => {
  await expect(
    renderCaddy({
      origin: 'https://approved.example.com',
      certificate: { cert: 'local.crt', key: 'local.key' },
    }),
  ).rejects.toThrow();
});
it('packages the explicit commit reproducibly and blocks private/generated tracked files', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'doctor-tracker-release-test-'));
  try {
    const repo = join(temp, 'repo');
    await mkdir(repo);
    const hooks = join(temp, 'empty-hooks');
    await mkdir(hooks);
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        [
          '-C',
          repo,
          '-c',
          `core.hooksPath=${hooks}`,
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.test',
          ...args,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      ).trim();
    git('init');
    await writeFile(join(repo, 'package-lock.json'), '{}\n');
    await writeFile(join(repo, '.env.example'), 'PLACEHOLDER=REQUIRED\n');
    git('add', '.');
    git('commit', '-m', 'fixture');
    const commit = git('rev-parse', 'HEAD');
    const script = resolve('scripts/prepare-release.mjs');
    const prepare = (out: string, revision = commit) =>
      execFileSync(
        process.execPath,
        [script, '--repo', repo, '--commit', revision, '--out', join(temp, out)],
        { stdio: 'pipe', windowsHide: true },
      );
    prepare('first');
    prepare('second');
    const a = JSON.parse(await readFile(join(temp, 'first/release-manifest.json'), 'utf8'));
    const b = JSON.parse(await readFile(join(temp, 'second/release-manifest.json'), 'utf8'));
    expect(a.archiveSha256).toBe(b.archiveSha256);
    expect(a.commit).toBe(commit);
    expect(a.deploymentAuthorized).toBe(false);
    expect(() => prepare('bad-short', 'HEAD')).toThrow();
    expect(() => prepare('first')).toThrow();
    await writeFile(join(repo, '.env'), 'PRIVATE_FIXTURE_ONLY=blocked\n');
    git('add', '.env');
    git('commit', '-m', 'private fixture');
    expect(() => prepare('blocked', git('rev-parse', 'HEAD'))).toThrow();
    git('rm', '.env');
    await mkdir(join(repo, 'node_modules'));
    await writeFile(join(repo, 'node_modules/fixture.js'), 'fixture only');
    git('add', '-f', 'node_modules/fixture.js');
    git('commit', '-m', 'generated fixture');
    expect(() => prepare('generated-blocked', git('rev-parse', 'HEAD'))).toThrow();
  } finally {
    expect(dirname(resolve(temp))).toBe(resolve(tmpdir()));
    expect(basename(temp)).toMatch(/^doctor-tracker-release-test-/);
    await rm(temp, { recursive: true, force: true });
  }
});
