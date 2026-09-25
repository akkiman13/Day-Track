import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'studytrack_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function authIsRequired(): boolean {
  return Boolean(process.env.STUDYTRACK_PASSWORD);
}

export function authIsConfigured(): boolean {
  const secret = process.env.STUDYTRACK_AUTH_SECRET;
  return Boolean(process.env.STUDYTRACK_PASSWORD && secret && Buffer.byteLength(secret, 'utf8') >= 32);
}

export function passwordMatches(candidate: string, configured: string): boolean {
  const candidateHash = createHash('sha256').update(candidate).digest();
  const configuredHash = createHash('sha256').update(configured).digest();
  return timingSafeEqual(candidateHash, configuredHash);
}

export function createSessionToken(secret: string, expiresAt: number): string {
  const payload = `${expiresAt}.${randomBytes(18).toString('base64url')}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const lastDot = token.lastIndexOf('.');
  if (lastDot < 1) return false;
  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return false;
  const expiresAt = Number(payload.slice(0, payload.indexOf('.')));
  return Number.isSafeInteger(expiresAt) && Date.now() < expiresAt;
}
