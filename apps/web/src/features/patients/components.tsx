'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
  doctorIdSchema,
  type Doctor,
  type DoctorDirectory,
  type Patient,
  type PatientDirectory,
} from '@doctor-tracker/shared';
import { api, ApiError } from '../../lib/api';
import { useDoctorQuery as useRecordQuery } from '../doctors/use-doctor-query';
import { doctorDate } from '../doctors/helpers';
export function RecordState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: ApiError;
  retry: () => void;
}) {
  return loading ? (
    <p role="status" className="doctor-loading">
      Loading patient records...
    </p>
  ) : error ? (
    <section role="alert" className="doctor-message">
      <h2>
        {error.status === 404
          ? 'Record not found'
          : error.status === 422
            ? 'Check the filters or record link'
            : 'Unable to load records'}
      </h2>
      <p>{error.message}</p>
      {error.fields && <p>{Object.values(error.fields).flat().join(' ')}</p>}
      <div>
        <button className="secondary-button" onClick={retry}>
          Try again
        </button>
        <Link href="/patients" className="quiet-link">
          Back to patients
        </Link>
      </div>
    </section>
  ) : null;
}
export function DoctorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const selected = useRecordQuery<{ doctor: Doctor }>(
    doctorIdSchema.safeParse(value).success ? `/doctors/${value}` : null,
  );
  const lookup = useRecordQuery<DoctorDirectory>(
    open ? `/doctors?${new URLSearchParams({ q: search, limit: '10', sort: 'name-asc' })}` : null,
    300,
  );
  return (
    <div className="field doctor-picker">
      <label htmlFor={id}>Assigned doctor</label>
      {value && (
        <p>
          {selected.data?.doctor.name ??
            (selected.error ? 'Doctor unavailable' : 'Loading doctor...')}{' '}
          <button
            type="button"
            className="copy-link"
            onClick={() => {
              onChange('');
              setOpen(true);
            }}
          >
            Clear doctor
          </button>
        </p>
      )}
      <input
        id={id}
        type="search"
        value={search}
        placeholder="Find a doctor by name"
        maxLength={120}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="field-hint">
        Select a doctor from the results. Type to narrow the list.
      </p>
      {open && (
        <>
          <RecordState loading={lookup.loading} error={lookup.error} retry={lookup.retry} />
          {lookup.data && (
            <>
              <ul className="doctor-picker-options">
                {lookup.data.items.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(d.id);
                        setOpen(false);
                        setSearch('');
                      }}
                    >
                      {d.name}
                      <small>
                        {d.specialization} / {d.hospital}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
              {lookup.data.items.length === 0 && <p className="field-hint">No matching doctors.</p>}
              {lookup.data.pagination.hasNextPage && (
                <p className="field-hint">More doctors available. Refine your search.</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
export function Pages({
  data,
  change,
}: {
  data: PatientDirectory['pagination'];
  change: (page: number) => void;
}) {
  return data.totalPages > 0 ? (
    <nav className="doctor-pagination" aria-label="Patient directory pages">
      <button disabled={!data.hasPreviousPage} onClick={() => change(data.page - 1)}>
        Previous
      </button>
      <span>
        Page {data.page} of {data.totalPages}
      </span>
      <button disabled={!data.hasNextPage} onClick={() => change(data.page + 1)}>
        Next
      </button>
    </nav>
  ) : null;
}
export function PatientRecords({
  data,
  scope,
  back,
  refresh,
}: {
  data: PatientDirectory;
  scope?: string;
  back: string;
  refresh: () => void;
}) {
  const [remove, setRemove] = useState<Patient>();
  const actions = (p: Patient) => (
    <div className="patient-actions">
      <Link
        href={`/patients/${p.id}/edit?returnTo=${encodeURIComponent(back)}`}
        aria-label={`Edit ${p.name}`}
      >
        Edit
      </Link>
      <button onClick={() => setRemove(p)} aria-label={`Delete ${p.name}`}>
        Delete
      </button>
    </div>
  );
  const detail = (p: Patient) => `/patients/${p.id}?returnTo=${encodeURIComponent(back)}`;
  return (
    <>
      {!data.items.length ? (
        <section className="doctor-message">
          <h2>{data.pagination.totalItems ? 'This page has no records' : 'No patients found'}</h2>
          <p>
            {scope
              ? 'Add a patient to this doctor, or adjust the filters.'
              : 'Adjust the filters or add a patient under their doctor.'}
          </p>
        </section>
      ) : (
        <>
          <div className="patient-table-wrap">
            <table className="patient-table">
              <caption className="sr-only">Patient records. Added dates are in UTC.</caption>
              <thead>
                <tr>
                  <th scope="col">Patient</th>
                  <th scope="col">Condition</th>
                  <th scope="col">Assigned doctor</th>
                  <th scope="col">Added</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link className="patient-name" href={detail(p)}>
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.condition}</td>
                    <td>
                      <Link href={`/doctors/${p.doctorId}`}>{p.doctor.name}</Link>
                    </td>
                    <td>
                      <time dateTime={p.createdAt}>{doctorDate(p.createdAt)}</time>
                    </td>
                    <td>{actions(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="doctor-mobile-list">
            {data.items.map((p) => (
              <article key={p.id}>
                <Link className="patient-name" href={detail(p)}>
                  {p.name}
                </Link>
                <dl>
                  <div>
                    <dt>Condition</dt>
                    <dd>{p.condition}</dd>
                  </div>
                  <div>
                    <dt>Doctor</dt>
                    <dd>
                      <Link href={`/doctors/${p.doctorId}`}>{p.doctor.name}</Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Added</dt>
                    <dd>{doctorDate(p.createdAt)}</dd>
                  </div>
                </dl>
                {actions(p)}
              </article>
            ))}
          </div>
        </>
      )}
      {remove && (
        <DeletePatient
          patient={remove}
          scope={scope}
          close={() => setRemove(undefined)}
          done={() => {
            setRemove(undefined);
            refresh();
          }}
        />
      )}
    </>
  );
}
export function DeletePatient({
  patient,
  scope,
  close,
  done,
}: {
  patient: Patient;
  scope?: string;
  close: () => void;
  done: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const title = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = dialog.current!;
    el.showModal();
    return () => {
      el.close();
      previous?.focus();
    };
  }, []);
  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await api.get('/auth/me');
      await api.delete(
        scope ? `/doctors/${scope}/patients/${patient.id}` : `/patients/${patient.id}`,
      );
      done();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(
              0,
              'CONNECTION_ERROR',
              'Unable to delete this record. Check the registry before trying again.',
            ),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="delete-dialog"
      aria-labelledby={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending.current) close();
      }}
    >
      <h2 id={title}>Delete patient?</h2>
      <p>
        <strong>{patient.name}</strong> will be permanently deleted from the registry and their
        doctor&apos;s patient list. This cannot be undone.
      </p>
      {error && (
        <div className="form-error" role="alert">
          <p>{error.message}</p>
          {error.status === 401 && (
            <Link className="text-link" href="/login" target="_blank" rel="noopener noreferrer">
              Log in in a new tab
            </Link>
          )}
          {error.status === 0 && (
            <p>The result is uncertain. Refresh records before repeating this action.</p>
          )}
        </div>
      )}
      <div className="record-actions">
        <button className="secondary-button" autoFocus disabled={busy} onClick={close}>
          Cancel
        </button>
        {error?.status === 404 || error?.status === 0 ? (
          <button className="secondary-button" onClick={done}>
            Refresh records
          </button>
        ) : (
          <button className="button danger-button" disabled={busy} onClick={remove}>
            {busy ? 'Deleting...' : 'Delete patient'}
          </button>
        )}
      </div>
    </dialog>
  );
}
