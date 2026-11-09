'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  doctorIdSchema,
  patientIdSchema,
  patientQuerySchema,
  formatBangladeshPhone,
  type Doctor,
  type Patient,
  type PatientDirectory,
} from '@doctor-tracker/shared';
import { ApiError } from '../../lib/api';
import { useDoctorQuery as useRecordQuery } from '../doctors/use-doctor-query';
import { doctorDate } from '../doctors/helpers';
import { DoctorPicker, RecordState, PatientRecords, Pages, DeletePatient } from './components';
import { PatientForm } from './patient-form';
import { ageLabel, birthDateLabel, genderLabels } from './helpers';
import './patients.css';
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
          <h1>Patients</h1>
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
  const search = params.get('patientQ') ?? '';
  const query = useRecordQuery<PatientDirectory>(
    `/doctors/${doctor.id}/patients?${new URLSearchParams({ page: String(Number.isSafeInteger(page) && page > 0 ? page : 0), limit: '10', ...(search ? { q: search } : {}) })}`,
    300,
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
      <div className="field doctor-patient-search">
        <label htmlFor="assigned-patient-search">Search assigned patients</label>
        <input
          id="assigned-patient-search"
          type="search"
          value={search}
          maxLength={120}
          placeholder="Patient name or condition"
          onChange={(event) => {
            const next = new URLSearchParams(window.location.search);
            next.delete('patientPage');
            if (event.target.value) next.set('patientQ', event.target.value);
            else next.delete('patientQ');
            window.history.replaceState(
              null,
              '',
              `/doctors/${doctor.id}${next.size ? `?${next}` : ''}`,
            );
          }}
        />
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
    <div className="doctors-feature patient-editor">
      <div className="doctor-page-heading">
        <div>
          <h1>{patientId ? 'Edit patient' : 'Add patient'}</h1>
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
          <div className="doctor-page-heading patient-profile-heading">
            <div>
              <h1 className="doctor-detail-name">{p.name}</h1>
              {p.nameBangla && (
                <p className="patient-bangla-name" lang="bn">
                  {p.nameBangla}
                </p>
              )}
              <div className="patient-identity-line">
                {ageLabel(p) && <span>{ageLabel(p)}</span>}
                {p.gender && <span>{genderLabels[p.gender]}</span>}
                {p.bloodGroup && (
                  <span className="patient-blood-group">Blood group: {p.bloodGroup}</span>
                )}
              </div>
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
          <div className="patient-record-layout">
            <section className="patient-clinical-section" aria-label="Patient medical details">
              <h2>Medical information</h2>
              <dl className="patient-clinical-list">
                <div>
                  <dt>Condition</dt>
                  <dd className="patient-primary-condition">{p.condition}</dd>
                </div>
                {p.chiefComplaint && (
                  <div>
                    <dt>Symptoms / chief complaint</dt>
                    <dd>{p.chiefComplaint}</dd>
                  </div>
                )}
                <div>
                  <dt>Allergies</dt>
                  <dd>
                    {p.allergyStatus === 'known'
                      ? p.allergies
                      : p.allergyStatus === 'none-known'
                        ? 'No known allergies'
                        : p.allergyStatus === 'unknown'
                          ? 'Unknown'
                          : 'Not recorded'}
                  </dd>
                </div>
                {p.medicalHistory && (
                  <div>
                    <dt>Medical history</dt>
                    <dd>{p.medicalHistory}</dd>
                  </div>
                )}
                {p.currentMedications && (
                  <div>
                    <dt>Current medications</dt>
                    <dd>{p.currentMedications}</dd>
                  </div>
                )}
                {p.clinicalNotes && (
                  <div>
                    <dt>Additional notes</dt>
                    <dd>{p.clinicalNotes}</dd>
                  </div>
                )}
              </dl>
            </section>
            <aside className="patient-record-aside" aria-label="Patient contact and doctor">
              <section>
                <h2>Contact & personal details</h2>
                <dl className="patient-contact-list">
                  {p.dateOfBirth && (
                    <div>
                      <dt>Date of birth</dt>
                      <dd>{birthDateLabel(p.dateOfBirth)}</dd>
                    </div>
                  )}
                  {!p.dateOfBirth && !p.approximateAge && (
                    <div>
                      <dt>Age</dt>
                      <dd>Not recorded</dd>
                    </div>
                  )}
                  <div>
                    <dt>Mobile</dt>
                    <dd>
                      {p.mobile ? (
                        <a href={`tel:${p.mobile}`}>{formatBangladeshPhone(p.mobile)}</a>
                      ) : (
                        'Not recorded'
                      )}
                    </dd>
                  </div>
                  {p.email && (
                    <div>
                      <dt>Email</dt>
                      <dd>
                        <a href={`mailto:${p.email}`}>{p.email}</a>
                      </dd>
                    </div>
                  )}
                  {[p.addressLine, p.upazila, p.district, p.division, p.postalCode].some(
                    Boolean,
                  ) && (
                    <div>
                      <dt>Address</dt>
                      <dd>
                        {[p.addressLine, p.upazila, p.district, p.division, p.postalCode]
                          .filter(Boolean)
                          .join(', ')}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
              {p.emergencyContact && (
                <section>
                  <h2>Emergency contact</h2>
                  <p className="patient-contact-name">{p.emergencyContact.name}</p>
                  <p>
                    {p.emergencyContact.relationship}
                    {p.emergencyContact.relationshipOther
                      ? ` · ${p.emergencyContact.relationshipOther}`
                      : ''}
                  </p>
                  <a href={`tel:${p.emergencyContact.mobile}`}>
                    {formatBangladeshPhone(p.emergencyContact.mobile)}
                  </a>
                </section>
              )}
              <section className="patient-record-doctor">
                <h2>Assigned doctor</h2>
                <Link href={`/doctors/${p.doctorId}`}>{p.doctor.name}</Link>
                {p.doctor.specialization && <p>{p.doctor.specialization}</p>}
              </section>
            </aside>
          </div>
          <div className="patient-record-dates">
            <span>
              Added <time dateTime={p.createdAt}>{doctorDate(p.createdAt)}</time>
            </span>
            <span>
              Updated <time dateTime={p.updatedAt}>{doctorDate(p.updatedAt)}</time>
            </span>
          </div>
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
