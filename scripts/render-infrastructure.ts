import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { renderCaddy } from './lib/infrastructure.js';

const args = process.argv.slice(2);
const value = (key: string) => args[args.indexOf(key) + 1];
if (!args.includes('--origin') || !args.includes('--email') || !args.includes('--out'))
  throw new Error(
    'Required: --origin <approved HTTPS origin> --email <approved renewal contact> --out <review directory>. This renders files only; it never deploys.',
  );
const text = await renderCaddy({ origin: value('--origin')!, email: value('--email')! });
const directory = resolve(value('--out')!);
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'Caddyfile'), text, { flag: 'wx' });
process.stdout.write(
  'Rendered a review-only Caddyfile. No service, DNS or certificate request was started.\n',
);
