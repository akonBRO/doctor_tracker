'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, UsersRound } from 'lucide-react';
import { doctorIdSchema, type Doctor } from '@doctor-tracker/shared';
import { ApiError } from '../../lib/api';
import { useDoctorQuery } from './use-doctor-query';
import { directoryReturn, doctorDate } from './helpers';
import { DoctorLoading, DoctorQueryError } from './query-state';

export function DoctorDetailPage({ doctorId }: { doctorId: string }) {
  const params = useSearchParams();
  const back = directoryReturn(params.get('returnTo'));
  const valid = doctorIdSchema.safeParse(doctorId).success;
  const query = useDoctorQuery<{ doctor: Doctor }>(valid ? `/doctors/${doctorId}` : null);
  const record = query.data?.doctor;
  return (
    <div className="doctors-feature">
      <Link href={back} className="back-link">
        <ArrowLeft size={15} /> Back to doctors
      </Link>
      {!valid ? (
        <DoctorQueryError
          error={new ApiError(422, 'INVALID_ID', 'This doctor link is invalid.')}
          retry={query.retry}
        />
      ) : query.loading ? (
        <DoctorLoading />
      ) : query.error ? (
        <DoctorQueryError error={query.error} retry={query.retry} />
      ) : (
        record && (
          <>
            {params.get('created') === '1' && (
              <p className="doctor-success" role="status">
                <Check size={17} /> Doctor added. The record is saved in your directory.
              </p>
            )}
            <div className="doctor-page-heading">
              <div>
                <p className="eyebrow">DOCTOR RECORD</p>
                <h1 className="doctor-detail-name">{record.name}</h1>
                <p>{record.specialization}</p>
              </div>
            </div>
            <section className="doctor-detail-panel" aria-labelledby="doctor-details-title">
              <div className="record-section-heading">
                <h2 id="doctor-details-title">Practice & contact details</h2>
                <p>
                  Added <time dateTime={record.createdAt}>{doctorDate(record.createdAt)}</time> ·
                  UTC
                </p>
              </div>
              <dl className="doctor-detail-grid">
                <div>
                  <dt>Specialization</dt>
                  <dd>{record.specialization}</dd>
                </div>
                <div>
                  <dt>Hospital</dt>
                  <dd>{record.hospital}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>
                    <a href={`tel:${record.phone.replace(/[^\d+]/g, '')}`}>{record.phone}</a>
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${record.email}`}>{record.email}</a>
                  </dd>
                </div>
              </dl>
            </section>
            <section className="doctor-patient-foundation">
              <UsersRound size={23} strokeWidth={1.5} />
              <div>
                <h2>Patients</h2>
                <p>
                  Patient records for this doctor will be available in a future update. Patient
                  management is not available yet.
                </p>
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
