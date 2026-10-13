import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP scrypt: 32 MiB, r=8, p=3. The parameters are fixed, never supplied by a request.
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key));
});
export const validPassword = (value: unknown): value is string => typeof value === 'string'
  && [...value].length >= 15 && Buffer.byteLength(value, 'utf8') <= 256;
export async function hashPassword(password: string) {
  if (!validPassword(password)) throw new Error('Usa una contraseña de al menos 15 caracteres y hasta 256 bytes.');
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, hash?: string) {
  const parts = hash?.split('$');
  const valid = parts?.length === 3 && parts[0] === 'scrypt' && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  // Unknown usernames still incur the same password derivation cost.
  const actual = await derive(password, valid ? parts![1] : '0'.repeat(32));
  const expected = Buffer.from(valid ? parts![2] : '0'.repeat(128), 'hex');
  return timingSafeEqual(actual, expected) && Boolean(valid);
}
