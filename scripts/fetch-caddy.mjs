// Downloads a checksum-pinned test tool into ignored tmp/. Installs no service or PATH entry.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = JSON.parse(await readFile(join(root, 'deploy/caddy-release.json'), 'utf8'));
const platform = process.argv.includes('--linux') ? 'linux' : process.platform;
if (process.arch !== 'x64' || !release.archives[platform])
  throw new Error('Pinned Caddy tooling supports x64 Windows/Linux only.');
const archive = release.archives[platform];
const directory = resolve(root, 'tmp/tools/caddy', release.version, platform);
if (relative(resolve(root, 'tmp/tools'), directory).startsWith('..'))
  throw new Error('Invalid tool destination.');
await mkdir(directory, { recursive: true });
const archivePath = join(directory, archive.name);
let bytes;
try {
  bytes = await readFile(archivePath);
} catch {
  /* First download. */
}
const digest = (value) => createHash('sha256').update(value).digest('hex');
if (!bytes || digest(bytes) !== archive.sha256) {
  const response = await globalThis.fetch(
    `https://github.com/caddyserver/caddy/releases/download/v${release.version}/${archive.name}`,
    { signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok) throw new Error('Pinned Caddy download failed.');
  bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== archive.sha256) throw new Error('Caddy archive checksum mismatch.');
  await writeFile(archivePath, bytes);
}
if (platform === 'win32') {
  const extractor = join(directory, 'extract.ps1');
  await writeFile(
    extractor,
    'param([string]$Archive,[string]$Destination)\nExpand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force\n',
  );
  execFileSync('powershell.exe', ['-NoProfile', '-File', extractor, archivePath, directory], {
    stdio: 'pipe',
    windowsHide: true,
  });
} else {
  execFileSync(
    process.platform === 'win32' ? 'tar.exe' : 'tar',
    ['-xzf', archivePath, '-C', directory, 'caddy'],
    { stdio: 'pipe', windowsHide: true },
  );
}
process.stdout.write(
  `Verified Caddy ${release.version} ${platform} archive; extracted only under ignored tmp/tools.\n`,
);
