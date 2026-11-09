'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { doctorInputSchema, type Doctor } from '@doctor-tracker/shared';
import { api, ApiError } from '../../lib/api';
import { directoryReturn } from './helpers';

const inputs = [
  {
    key: 'name',
    label: 'Doctor name',
    placeholder: 'e.g. Dr. Nadia Rahman',
    max: 120,
  },
  { key: 'specialization', label: 'Specialization', placeholder: 'e.g. Cardiology', max: 100 },
  {
    key: 'hospital',
    label: 'Hospital',
    placeholder: 'e.g. Dhaka Medical College Hospital',
    max: 160,
  },
  { key: 'phone', label: 'Phone', placeholder: '01712345678 or +8801712345678', max: 40 },
  { key: 'email', label: 'Email', placeholder: 'doctor@example.com', max: 254 },
] as const;
export function CreateDoctorPage() {
  const router = useRouter();
  const params = useSearchParams();
  const back = directoryReturn(params.get('returnTo'));
  const inFlight = useRef(false);
  const saved = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const [values, setValues] = useState({
    name: '',
    specialization: '',
    hospital: '',
    phone: '',
    email: '',
  });
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (dirty && !saved.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setError('');
    setExpired(false);
    setUncertain(false);
    setFields({});
    const parsed = doctorInputSchema.safeParse(values);
    if (!parsed.success) {
      setFields(parsed.error.flatten().fieldErrors);
      const first = parsed.error.issues[0]?.path[0];
      if (typeof first === 'string')
        formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      // Restore expiring access before the write. Never automatically retry a submitted mutation.
      await api.get('/auth/me');
      const response = await api.post<{ doctor: Doctor }>('/doctors', parsed.data);
      saved.current = true;
      router.replace(
        `/doctors/${response.doctor.id}?${new URLSearchParams({ returnTo: back, created: '1' })}`,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 0
            ? 'We couldn’t confirm whether this doctor was saved. Check the directory before submitting again.'
            : err.message,
        );
        setUncertain(err.status === 0);
        setFields(err.fields ?? {});
        setExpired(err.status === 401);
      } else
        setError('The record could not be saved. Your entries are still here. Please try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="doctors-feature doctor-editor">
      <Link
        href={back}
        className="back-link"
        onClick={(event) => {
          if (busy) event.preventDefault();
          else if (dirty) {
            event.preventDefault();
            setDiscard(true);
          }
        }}
      >
        <ArrowLeft size={15} /> Back to doctors
      </Link>
      <div className="doctor-page-heading">
        <div>
          <h1>Add Doctor</h1>
          <p>All fields are required.</p>
        </div>
      </div>
      <form
        className="doctor-form"
        ref={formRef}
        onSubmit={submit}
        onChange={() => setDirty(true)}
        noValidate
      >
        <fieldset disabled={busy}>
          <legend className="sr-only">Doctor information</legend>
          {inputs.map((input) => (
            <div className={`field doctor-field-${input.key}`} key={input.key}>
              <label htmlFor={`doctor-${input.key}`}>
                {input.label} <span aria-hidden="true">*</span>
              </label>
              <input
                id={`doctor-${input.key}`}
                name={input.key}
                value={values[input.key]}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, [input.key]: event.target.value }))
                }
                type={input.key === 'email' ? 'email' : input.key === 'phone' ? 'tel' : 'text'}
                autoComplete="off"
                placeholder={input.placeholder}
                maxLength={input.max}
                required
                aria-invalid={!!fields[input.key]}
                aria-describedby={
                  fields[input.key]
                    ? `doctor-${input.key}-error`
                    : input.key === 'phone'
                      ? 'phone-hint'
                      : undefined
                }
              />
              {input.key === 'phone' && (
                <p id="phone-hint" className="field-hint">
                  Bangladesh mobile, hospital landline or international number.
                </p>
              )}
              {fields[input.key] && (
                <p id={`doctor-${input.key}-error`} className="field-error" role="alert">
                  {fields[input.key]![0]}
                </p>
              )}
            </div>
          ))}
        </fieldset>
        {error && (
          <div className="form-error" role="alert">
            <p>{error}</p>
            <p>Your entries have been kept.</p>
            {uncertain && (
              <Link
                href="/doctors?sort=newest"
                target="_blank"
                rel="noopener noreferrer"
                className="text-link"
              >
                Check the directory in a new tab
              </Link>
            )}
            {expired && (
              <p>
                <Link href="/login" target="_blank" rel="noopener noreferrer" className="text-link">
                  Sign in in a new tab
                </Link>
                , then return here and submit again.
              </p>
            )}
          </div>
        )}
        <div className="doctor-form-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => (dirty ? setDiscard(true) : router.push(back))}
          >
            Cancel
          </button>
          <button className="button" disabled={busy} type="submit">
            {busy ? 'Saving doctor…' : 'Save doctor'}
            {!busy && <ArrowRight size={17} />}
          </button>
        </div>
        {discard && (
          <div className="discard-confirmation" role="alert">
            <p>Leave this form and discard your unsaved entries?</p>
            <button type="button" className="secondary-button" onClick={() => setDiscard(false)}>
              Keep editing
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                saved.current = true;
                router.push(back);
              }}
            >
              Discard and leave
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
