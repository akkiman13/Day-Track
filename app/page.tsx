import { cookies } from 'next/headers';
import { StudyApp } from '@/components/study-app';
import { LoginScreen } from '@/components/login-screen';
import { authIsConfigured, authIsRequired, SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function AuthSetupMessage() {
  return (
    <main className="auth-page">
      <section className="auth-card auth-error-card">
        <div className="brand-mark"><span>ST</span></div>
        <p className="eyebrow">STUDYTRACK ACCESS</p>
        <h1>Finish access setup</h1>
        <p className="auth-copy">A password is configured, but the signing secret is missing or too short. Set <code>STUDYTRACK_AUTH_SECRET</code> to at least 32 bytes in your environment and redeploy. The dashboard remains locked until both values are valid.</p>
      </section>
    </main>
  );
}

export default async function HomePage() {
  const required = authIsRequired();
  if (required && !authIsConfigured()) return <AuthSetupMessage />;

  if (required) {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const secret = process.env.STUDYTRACK_AUTH_SECRET!;
    if (!verifySessionToken(token, secret)) return <LoginScreen />;
  }

  return <StudyApp authEnabled={required} />;
}
