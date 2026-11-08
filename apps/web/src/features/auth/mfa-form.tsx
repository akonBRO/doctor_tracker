'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Copy, KeyRound, ShieldCheck } from 'lucide-react';
import {
  recoverySchema,
  totpSchema,
  type AuthResponse,
  type AuthStep,
} from '@doctor-tracker/shared';
import { api, ApiError } from '../../lib/api';

type Setup = { secret: string; uri: string };
export function MfaForm() {
  const router = useRouter();
  const init = useRef<Promise<{ step: AuthStep; setup?: Setup }> | null>(null);
  const [step, setStep] = useState<AuthStep['step']>();
  const [setup, setSetup] = useState<Setup>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [codes, setCodes] = useState<string[]>();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    init.current ??= api.get<AuthStep>('/auth/mfa/challenge').then(async (status) => ({
      step: status,
      ...(status.step === 'enroll' ? { setup: await api.post<Setup>('/auth/mfa/setup') } : {}),
    }));
    init.current
      .then((result) => {
        if (active) {
          setStep(result.step.step);
          setSetup(result.setup);
        }
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : 'Verification could not be started.');
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const value = new FormData(form).get('code');
    const result = (recovery ? recoverySchema : totpSchema).safeParse({ code: value });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Check your code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await api.post<AuthResponse>(
        `/auth/mfa/${recovery ? 'recovery' : 'verify'}`,
        result.data,
      );
      form.reset();
      setSetup(undefined);
      if (response.recoveryCodes) setCodes(response.recoveryCodes);
      else {
        router.replace('/dashboard');
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError('Copy is unavailable. Select the text and copy it manually.');
    }
  }
  if (codes)
    return (
      <>
        <span className="form-icon">
          <ShieldCheck size={26} />
        </span>

        <h1>Save your recovery codes</h1>
        <p className="form-description">
          Save these recovery codes somewhere private. Each code can be used once if you lose access
          to your authenticator. They won’t be shown again.
        </p>
        <div className="recovery-codes">
          {codes.map((code) => (
            <code key={code}>{code}</code>
          ))}
        </div>
        <button className="copy-link" onClick={() => copy(codes.join('\n'))}>
          <Copy size={15} /> {copied ? 'Copied' : 'Copy recovery codes'}
        </button>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={saved}
            onChange={(event) => setSaved(event.target.checked)}
          />{' '}
          I’ve saved my recovery codes in a safe place.
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button full-width"
          disabled={!saved}
          onClick={() => {
            setCodes(undefined);
            router.replace('/dashboard');
            router.refresh();
          }}
        >
          Enter your workspace <ArrowRight size={17} />
        </button>
      </>
    );
  return (
    <>
      <span className="form-icon">
        <KeyRound size={25} />
      </span>

      <h1>
        {step === 'enroll'
          ? 'Set up your authenticator'
          : recovery
            ? 'Use a recovery code.'
            : 'Verify your identity'}
      </h1>
      <p className="form-description">
        {step === 'enroll'
          ? 'Add Doctor Tracker to an authenticator app, then enter its six-digit code to finish setup.'
          : recovery
            ? 'Enter one of the recovery codes you saved during setup.'
            : 'Enter the six-digit code from your authenticator app to continue.'}
      </p>
      {!step && !error && (
        <p role="status" className="muted">
          Preparing secure verification…
        </p>
      )}
      {setup && (
        <div className="setup-box">
          <p>
            <strong>1.</strong> In your authenticator, choose “Add account” → “Enter a setup key”.
            Select <strong>time-based</strong> codes.
          </p>
          <label htmlFor="setup-key">Your manual setup key</label>
          <div className="setup-key">
            <input
              id="setup-key"
              value={setup.secret}
              readOnly
              aria-label="Your manual setup key"
            />
            <button aria-label="Copy setup key" onClick={() => copy(setup.secret)}>
              {copied ? <Check size={17} /> : <Copy size={17} />}
            </button>
          </div>
          <p>
            <strong>2.</strong> Name the account “Doctor Tracker”, then enter the code below.
          </p>
        </div>
      )}
      {step && (
        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="code">{recovery ? 'Recovery code' : 'Authenticator code'}</label>
            <input
              key={String(recovery)}
              className={recovery ? 'recovery-input' : 'otp-input'}
              id="code"
              name="code"
              type="text"
              inputMode={recovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              maxLength={recovery ? 16 : 6}
              placeholder={recovery ? 'Your saved recovery code' : '000000'}
              required
              aria-describedby="code-hint"
            />
            <p id="code-hint" className="field-hint">
              {recovery
                ? 'Each recovery code can only be used once.'
                : 'Codes refresh every 30 seconds.'}
            </p>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button full-width" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify & continue'}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>
      )}
      {!step && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {step === 'verify' && (
        <button
          className="copy-link recovery-toggle"
          onClick={() => {
            setRecovery(!recovery);
            setError('');
          }}
        >
          {recovery
            ? 'Use my authenticator instead'
            : 'Can’t access your authenticator? Use a recovery code'}
        </button>
      )}
      <p className="auth-switch">
        <Link href="/login">Return to sign in</Link>
      </p>
    </>
  );
}
