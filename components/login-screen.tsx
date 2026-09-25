'use client';

import { FormEvent, useState } from 'react';
import { ArrowRight, BookOpen, LockKeyhole, ShieldCheck } from 'lucide-react';

export function LoginScreen() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(typeof body.error === 'string' ? body.error : 'Could not sign in. Please try again.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand-row">
          <div className="brand-mark"><BookOpen size={19} strokeWidth={2.2} /></div>
          <span className="brand-name">studytrack<span className="brand-period">.</span></span>
        </div>
        <div className="auth-lock"><LockKeyhole size={20} /></div>
        <p className="eyebrow">PERSONAL WORKSPACE</p>
        <h1>Good work takes focus.</h1>
        <p className="auth-copy">Sign in to open your private study log.</p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="access-password">Personal password</label>
          <input
            id="access-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary login-button" type="submit" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Continue'} <ArrowRight size={16} />
          </button>
        </form>
        <div className="auth-privacy"><ShieldCheck size={15} /><span>Access is checked on the server. Your study log stays in this browser.</span></div>
      </section>
      <p className="auth-footnote">A quiet place to keep showing up.</p>
    </main>
  );
}
