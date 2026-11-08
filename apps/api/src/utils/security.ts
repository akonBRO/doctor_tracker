import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import argon2 from 'argon2';

export const randomToken = () => randomBytes(32).toString('hex');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function encryptSecret(secret: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(
    '.',
  );
}
export function decryptSecret(value: string, key: string) {
  const [iv, tag, ciphertext] = value.split('.');
  if (!iv || !tag || !ciphertext) throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
