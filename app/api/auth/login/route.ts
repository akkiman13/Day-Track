import { NextResponse } from 'next/server';
import { authIsConfigured, createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!authIsConfigured()) {
    return NextResponse.json({ error: 'Personal access is not configured on this deployment.' }, { status: 503 });
  }

  let candidate = '';
  try {
    const body = await request.json() as { password?: unknown };
    if (typeof body.password === 'string' && body.password.length <= 1024) candidate = body.password;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const configured = process.env.STUDYTRACK_PASSWORD!;
  if (!candidate || !passwordMatches(candidate, configured)) {
    return NextResponse.json({ error: 'That password did not match. Try again.' }, { status: 401 });
  }

  const secret = process.env.STUDYTRACK_AUTH_SECRET!;
  const token = createSessionToken(secret, Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
