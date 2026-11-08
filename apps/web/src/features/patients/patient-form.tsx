'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  doctorIdSchema,
  patientInputSchema,
  type Patient,
  type PatientInput,
  type PatientDoctor,
} from '@doctor-tracker/shared';
import { api, ApiError } from '../../lib/api';
import { DoctorPicker } from './components';
export function PatientForm({
  initial,
  doctor,
  back,
}: {
  initial?: Patient;
  doctor?: PatientDoctor;
  back: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<PatientInput>({
    name: initial?.name ?? '',
    condition: initial?.condition ?? '',
  });
  const [selected, setSelected] = useState(doctor?.id ?? initial?.doctorId ?? '');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const flight = useRef(false);
  const saved = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty && !saved.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (flight.current) return;
    setError(undefined);
    const parsed = patientInputSchema.safeParse(values);
    const invalid: Record<string, string[]> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0]);
        (invalid[k] ??= []).push(issue.message);
      }
    if (!doctorIdSchema.safeParse(selected).success)
      invalid.doctorId = ['Select an existing doctor.'];
    setFields(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    flight.current = true;
    setBusy(true);
    try {
      await api.get('/auth/me');
      const result = initial
        ? await api.patch<{ patient: Patient }>(`/patients/${initial.id}`, parsed.data!)
        : await api.post<{ patient: Patient }>(`/doctors/${selected}/patients`, parsed.data!);
      saved.current = true;
      if (initial)
        router.push(`/patients/${result.patient.id}?returnTo=${encodeURIComponent(back)}&saved=1`);
      else if (doctor) {
        const destination = new URL(back, window.location.origin);
        destination.searchParams.delete('patientPage');
        destination.searchParams.set('patientCreated', '1');
        router.push(destination.pathname + destination.search);
      } else
        router.push(
          `/patients/${result.patient.id}?returnTo=${encodeURIComponent(back)}&created=1`,
        );
      router.refresh();
    } catch (err) {
      const failure =
        err instanceof ApiError ? err : new ApiError(0, 'CONNECTION_ERROR', 'Unable to save.');
      setError(failure);
      setFields(failure.fields ?? {});
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[role="alert"]')?.focus(),
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="doctor-form patient-form"
      ref={form}
      noValidate
      onSubmit={submit}
      onChange={() => setDirty(true)}
    >
      <fieldset disabled={busy}>
        <legend className="sr-only">Patient details</legend>
        {initial || doctor ? (
          <div className="assigned-doctor">
            <span>Assigned doctor</span>
            <strong>{initial?.doctor.name ?? doctor?.name}</strong>
            <p className="field-hint">The assigned doctor cannot be changed.</p>
          </div>
        ) : (
          <div aria-invalid={!!fields.doctorId} tabIndex={fields.doctorId ? -1 : undefined}>
            <DoctorPicker
              value={selected}
              onChange={(id) => {
                setSelected(id);
                setDirty(true);
              }}
            />
            {fields.doctorId && (
              <p className="field-error" role="alert">
                {fields.doctorId[0]}
              </p>
            )}
          </div>
        )}
        {(['name', 'condition'] as const).map((key) => (
          <div className="field" key={key}>
            <label htmlFor={`patient-${key}`}>
              {key === 'name' ? 'Patient name' : 'Condition'} <span aria-hidden="true">*</span>
            </label>
            {key === 'condition' ? (
              <textarea
                id={`patient-${key}`}
                name={key}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                maxLength={160}
                required
                aria-invalid={!!fields[key]}
                aria-describedby={fields[key] ? `error-${key}` : undefined}
              />
            ) : (
              <input
                id={`patient-${key}`}
                name={key}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                maxLength={120}
                required
                autoComplete="off"
                aria-invalid={!!fields[key]}
                aria-describedby={fields[key] ? `error-${key}` : undefined}
              />
            )}{' '}
            {fields[key] && (
              <p className="field-error" id={`error-${key}`} role="alert">
                {fields[key][0]}
              </p>
            )}
          </div>
        ))}
      </fieldset>
      {error && (
        <div className="form-error" role="alert" tabIndex={-1}>
          <p>{error.message}</p>
          <p>Your entries have been kept.</p>
          {error.status === 401 && (
            <Link className="text-link" href="/login" target="_blank" rel="noopener noreferrer">
              Log in in a new tab, then return to this form
            </Link>
          )}
          {error.status === 0 && (
            <p>
              The result is uncertain. Check the{' '}
              <Link
                className="text-link"
                href="/patients?sort=newest"
                target="_blank"
                rel="noopener noreferrer"
              >
                patient directory
              </Link>{' '}
              before submitting again.
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
          {busy ? 'Saving patient...' : 'Save patient'}
        </button>
      </div>
      {discard && (
        <div className="discard-confirmation" role="alert">
          <p>Discard unsaved patient details?</p>
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
  );
}
