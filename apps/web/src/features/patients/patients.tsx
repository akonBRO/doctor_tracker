'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  doctorIdSchema,
  patientIdSchema,
  patientQuerySchema,
  type Doctor,
  type Patient,
  type PatientDirectory,
} from '@doctor-tracker/shared';
import { ApiError } from '../../lib/api';
import { useDoctorQuery as useRecordQuery } from '../doctors/use-doctor-query';
import { doctorDate } from '../doctors/helpers';
import { DoctorPicker, RecordState, PatientRecords, Pages, DeletePatient } from './components';
import { PatientForm } from './patient-form';
function returnPath(value: string | null, fallback = '/patients') {
  if (!value || !/^\/(?:patients(?:\/[^/?#]+)?|doctors\/[a-f\d]{24})(?:\?|$)/i.test(value))
    return fallback;
  try {
    const url = new URL(value, 'https://local.test');
    return url.origin === 'https://local.test' ? url.pathname + url.search : fallback;
  } catch {
    return fallback;
  }
}
export function PatientDirectoryPage() {
  const params = useSearchParams();
  const raw = params.toString();
  const back = `/patients${raw ? `?${raw}` : ''}`;
  const query = useRecordQuery<PatientDirectory>(`/patients${raw ? `?${raw}` : ''}`, 300);
  function change(key: string, value: string, replace = false) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    window.history[replace ? 'replaceState' : 'pushState'](
      null,
      '',
      `/patients${next.size ? `?${next}` : ''}`,
    );
  }
  const sizes = [
    ...new Set([
      10,
      25,
      50,
      ...(patientQuerySchema.safeParse(Object.fromEntries(params)).success
        ? [Number(params.get('limit') ?? 10)]
        : []),
    ]),
  ].sort((a, b) => a - b);
  return (
    <div className="doctors-feature">
      <div className="doctor-page-heading">
        <div>
          <p className="eyebrow">PATIENT REGISTRY</p>
          <h1>Patients</h1>
          <p>Patient records and their assigned doctors.</p>
        </div>
        <Link className="button" href={`/patients/new?returnTo=${encodeURIComponent(back)}`}>
          <Plus size={18} />
          Add patient
        </Link>
      </div>
      <section className="directory-filters" aria-label="Search and filter patients">
        <div className="field">
          <label htmlFor="patient-search">Search patients</label>
          <input
            id="patient-search"
            type="search"
            value={params.get('q') ?? ''}
            maxLength={120}
            placeholder="Patient name or condition"
            onChange={(e) => change('q', e.target.value, true)}
          />
          <p className="field-hint">Search word prefixes. Combine up to five words.</p>
        </div>
        <div className="field">
          <label htmlFor="patient-sort">Sort by</label>
          <select
            id="patient-sort"
            value={params.get('sort') ?? 'newest'}
            onChange={(e) => change('sort', e.target.value)}
          >
            <option value="newest">Newest added</option>
            <option value="oldest">Oldest added</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
          </select>
        </div>
        <div className="doctor-filter-row">
          <div className="field">
            <label htmlFor="condition-filter">Condition</label>
            <input
              id="condition-filter"
              value={params.get('condition') ?? ''}
              maxLength={160}
              placeholder="Any condition"
              onChange={(e) => change('condition', e.target.value, true)}
            />
            <p className="field-hint">Exact match, ignoring case.</p>
          </div>
          <DoctorPicker
            value={params.get('doctorId') ?? ''}
            onChange={(id) => change('doctorId', id)}
          />
          {(['from', 'to'] as const).map((key) => (
            <div className="field" key={key}>
              <label htmlFor={`patient-${key}`}>
                {key === 'from' ? 'Added from (UTC)' : 'Added through (UTC)'}
              </label>
              <input
                id={`patient-${key}`}
                type="date"
                value={params.get(key) ?? ''}
                min={key === 'to' ? (params.get('from') ?? undefined) : undefined}
                onChange={(e) => change(key, e.target.value)}
              />
            </div>
          ))}
        </div>
        {['q', 'condition', 'doctorId', 'from', 'to'].some((k) => params.has(k)) && (
          <button
            className="reset-filters"
            onClick={() => {
              const n = new URLSearchParams();
              const valid = patientQuerySchema.safeParse({
                sort: params.get('sort') ?? 'newest',
                limit: params.get('limit') ?? 10,
              });
              if (valid.success) {
                n.set('sort', valid.data.sort);
                n.set('limit', String(valid.data.limit));
              }
              window.history.pushState(null, '', `/patients${n.size ? `?${n}` : ''}`);
            }}
          >
            Reset filters
          </button>
        )}
      </section>
      <RecordState loading={query.loading} error={query.error} retry={query.retry} />
      {query.data && (
        <>
          <div className="directory-caption">
            <p aria-live="polite">
              {query.data.pagination.totalItems} patients
              {query.data.items.length
                ? ` / showing ${(query.data.pagination.page - 1) * query.data.pagination.limit + 1}-${(query.data.pagination.page - 1) * query.data.pagination.limit + query.data.items.length}`
                : ''}
            </p>
            <label>
              Rows per page
              <select
                aria-label="Rows per page"
                value={params.get('limit') ?? '10'}
                onChange={(e) => change('limit', e.target.value)}
              >
                {sizes.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <PatientRecords data={query.data} back={back} refresh={query.retry} />
          <Pages data={query.data.pagination} change={(n) => change('page', String(n))} />
        </>
      )}
    </div>
  );
}
export function DoctorPatients({ doctor }: { doctor: Doctor }) {
  const params = useSearchParams();
  const raw = params.toString();
  const page = Number(params.get('patientPage') ?? 1);
  const query = useRecordQuery<PatientDirectory>(
    `/doctors/${doctor.id}/patients?page=${Number.isSafeInteger(page) && page > 0 ? page : 0}&limit=10`,
  );
  const back = `/doctors/${doctor.id}${raw ? `?${raw}` : ''}`;
  return (
    <section className="doctor-patients" aria-label="Assigned patients">
      {params.get('patientCreated') === '1' && (
        <p className="doctor-success" role="status">
          Patient added.
        </p>
      )}
      <div className="record-section-heading">
        <div>
          <h2>Patients{query.data ? ` (${query.data.pagination.totalItems})` : ''}</h2>
          <p>Assigned to {doctor.name}</p>
        </div>
        <div className="record-actions">
          <Link className="quiet-link" href={`/patients?doctorId=${doctor.id}`}>
            View in patient directory
          </Link>
          <Link
            className="button"
            href={`/doctors/${doctor.id}/patients/new?returnTo=${encodeURIComponent(back)}`}
          >
            Add patient
          </Link>
        </div>
      </div>
      <RecordState loading={query.loading} error={query.error} retry={query.retry} />
      {query.data && (
        <>
          <PatientRecords data={query.data} scope={doctor.id} back={back} refresh={query.retry} />
          <Pages
            data={query.data.pagination}
            change={(n) => {
              const next = new URLSearchParams(window.location.search);
              next.set('patientPage', String(n));
              window.history.pushState(null, '', `/doctors/${doctor.id}?${next}`);
            }}
          />
        </>
      )}
    </section>
  );
}
export function PatientEditorPage({
  patientId,
  doctorId,
}: {
  patientId?: string;
  doctorId?: string;
}) {
  const params = useSearchParams();
  const valid =
    (!patientId || patientIdSchema.safeParse(patientId).success) &&
    (!doctorId || doctorIdSchema.safeParse(doctorId).success);
  const record = useRecordQuery<{ patient: Patient }>(
    valid && patientId ? `/patients/${patientId}` : null,
  );
  const doctor = useRecordQuery<{ doctor: Doctor }>(
    valid && doctorId ? `/doctors/${doctorId}` : null,
  );
  const back = returnPath(params.get('returnTo'), doctorId ? `/doctors/${doctorId}` : '/patients');
  const error = !valid
    ? new ApiError(422, 'INVALID_ID', 'This record link is invalid.')
    : (record.error ?? doctor.error);
  if (error || record.loading || doctor.loading)
    return (
      <RecordState
        loading={record.loading || doctor.loading}
        error={error}
        retry={() => {
          record.retry();
          doctor.retry();
        }}
      />
    );
  if (patientId && !record.data) return null;
  return (
    <div className="doctors-feature doctor-editor">
      <div className="doctor-page-heading">
        <div>
          <p className="eyebrow">PATIENT RECORD</p>
          <h1>{patientId ? 'Edit patient' : 'Add patient'}</h1>
          <p>
            {patientId
              ? 'Update the name or condition.'
              : 'Enter patient details and confirm their doctor.'}
          </p>
        </div>
      </div>
      <PatientForm
        key={patientId ?? doctorId ?? 'new'}
        initial={record.data?.patient}
        doctor={doctor.data?.doctor}
        back={back}
      />
    </div>
  );
}
export function PatientDetailPage({ patientId }: { patientId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const back = returnPath(params.get('returnTo'));
  const valid = patientIdSchema.safeParse(patientId).success;
  const query = useRecordQuery<{ patient: Patient }>(valid ? `/patients/${patientId}` : null);
  const [remove, setRemove] = useState(false);
  const p = query.data?.patient;
  return (
    <div className="doctors-feature">
      <Link className="back-link" href={back}>
        Back to records
      </Link>
      <RecordState
        loading={query.loading}
        error={
          !valid ? new ApiError(422, 'INVALID_ID', 'This patient link is invalid.') : query.error
        }
        retry={query.retry}
      />
      {p && (
        <>
          {params.get('created') === '1' && (
            <p className="doctor-success" role="status">
              Patient added.
            </p>
          )}
          {params.get('saved') === '1' && (
            <p className="doctor-success" role="status">
              Patient updated.
            </p>
          )}
          <div className="doctor-page-heading">
            <div>
              <p className="eyebrow">PATIENT RECORD</p>
              <h1 className="doctor-detail-name">{p.name}</h1>
            </div>
            <div className="record-actions">
              <Link
                className="button"
                href={`/patients/${p.id}/edit?returnTo=${encodeURIComponent(back)}`}
              >
                Edit patient
              </Link>
              <button className="secondary-button" onClick={() => setRemove(true)}>
                Delete patient
              </button>
            </div>
          </div>
          <section className="doctor-detail-panel" aria-label="Patient details">
            <dl className="doctor-detail-grid">
              <div>
                <dt>Condition</dt>
                <dd>{p.condition}</dd>
              </div>
              <div>
                <dt>Assigned doctor</dt>
                <dd>
                  <Link href={`/doctors/${p.doctorId}`}>{p.doctor.name}</Link>
                </dd>
              </div>
              <div>
                <dt>Added (UTC)</dt>
                <dd>{doctorDate(p.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated (UTC)</dt>
                <dd>{doctorDate(p.updatedAt)}</dd>
              </div>
            </dl>
          </section>
          {remove && (
            <DeletePatient
              patient={p}
              close={() => setRemove(false)}
              done={() => {
                setRemove(false);
                router.push(back);
                router.refresh();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
