import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

for (const app of ['api', 'web']) {
  const target = new URL(`../apps/${app}/.env`, import.meta.url);
  if (existsSync(target)) {
    console.log(`Preserving apps/${app}/.env`);
    continue;
  }
  let content = readFileSync(new URL(`../apps/${app}/.env.example`, import.meta.url), 'utf8');
  content = content.replace(/REPLACE_WITH_64_RANDOM_HEX_CHARACTERS/g, () =>
    randomBytes(32).toString('hex'),
  );
  writeFileSync(target, content, { mode: 0o600 });
  console.log(`Created ignored apps/${app}/.env with independent local secrets.`);
}
