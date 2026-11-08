'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, KeyRound, Mail } from 'lucide-react';
import { loginSchema, signupSchema, type AuthStep } from '@doctor-tracker/shared';
import { api, ApiError } from '../../lib/api';

export function CredentialsForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const invitationRead = useRef(false);
  const signup = mode === 'signup';
  const [invitation, setInvitation] = useState('');
  const [initialized, setInitialized] = useState(!signup);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!signup || invitationRead.current) return;
    invitationRead.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? '';
    // Remove the one-time invitation from the address bar immediately. Keep it in memory only.
    if (window.location.hash) window.history.replaceState(null, '', '/signup');
    // Browser URL state is external to React; read it once after hydration and remove the secret.
    setInvitation(token);
    setInitialized(true);
  }, [signup]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setError('');
    setFields({});
    const values = {
      email: data.get('email'),
      password: data.get('password'),
      ...(signup ? { name: data.get('name'), invitation } : {}),
    };
    const parsed = (signup ? signupSchema : loginSchema).safeParse(values);
    if (!parsed.success) {
      setFields(parsed.error.flatten().fieldErrors);
      return;
    }
    setBusy(true);
    try {
      await api.post<AuthStep>(`/auth/${mode}`, parsed.data);
      router.push('/mfa');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else setError('Unable to complete sign-in. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  if (!initialized)
    return (
      <p role="status" className="muted">
        Checking your invitation…
      </p>
    );
  if (signup && !/^[a-f0-9]{64}$/.test(invitation))
    return (
      <div className="invite-message">
        <span className="form-icon">
          <KeyRound size={25} />
        </span>
        <h1>Create your account</h1>
        <p>
          Doctor Tracker is a private administrative workspace. You’ll need an invitation from your
          administrator to create an account.
        </p>
        <div className="invite-explainer">
          <Mail size={20} />
          <div>
            <strong>Already invited?</strong>
            <p>
              Open the invitation link shared with you. Each link is personal, expires after 24
              hours, and can be used once.
            </p>
          </div>
        </div>
        <Link className="button full-width" href="/login">
          Already have an account? Log in <ArrowRight size={17} />
        </Link>
        <p className="small muted">Need access? Contact the person who manages your workspace.</p>
      </div>
    );
  return (
    <>
      <h1>{signup ? 'Create your account' : 'Log in'}</h1>
      <p className="form-description">
        {signup
          ? 'Enter your details to accept your invitation.'
          : 'Sign in to your Doctor Tracker workspace.'}
      </p>
      {signup && (
        <div className="onboarding-steps" aria-label="Account setup: step 1 of 2">
          <span className="current">01 Account details</span>
          <span>02 Authenticator</span>
        </div>
      )}
      <form onSubmit={submit} noValidate className="auth-form">
        {signup && (
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              placeholder="Your full name"
              required
              maxLength={80}
              aria-invalid={!!fields.name}
              aria-describedby={fields.name ? 'name-error' : undefined}
            />
            <FieldError id="name-error" messages={fields.name} />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourpractice.com"
            required
            maxLength={254}
            aria-invalid={!!fields.email}
            aria-describedby={fields.email ? 'email-error' : undefined}
          />
          <FieldError id="email-error" messages={fields.email} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input
              id="password"
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete={signup ? 'new-password' : 'current-password'}
              placeholder={signup ? 'Create a strong password' : 'Enter your password'}
              required
              maxLength={128}
              aria-invalid={!!fields.password}
              aria-describedby={
                fields.password ? 'password-error' : signup ? 'password-hint' : undefined
              }
            />
            <button
              type="button"
              className="visibility-toggle"
              aria-label={visible ? 'Hide password' : 'Show password'}
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {signup && (
            <p id="password-hint" className="field-hint">
              At least 12 characters, including a letter and a number or symbol.
            </p>
          )}
          <FieldError id="password-error" messages={fields.password} />
        </div>
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}
        <button className="button full-width" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : signup ? 'Create account & continue' : 'Log in'}
          {!busy && <ArrowRight size={18} />}
        </button>
      </form>
      <div className="auth-switch">
        {signup ? 'Already have an account?' : 'New to the workspace?'}{' '}
        <Link href={signup ? '/login' : '/signup'}>
          {signup ? 'Log in' : 'Join with an invitation'} <ArrowRight size={13} />
        </Link>
      </div>
    </>
  );
}
function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  return messages?.length ? (
    <p className="field-error" id={id} role="alert">
      {messages[0]}
    </p>
  ) : null;
}
