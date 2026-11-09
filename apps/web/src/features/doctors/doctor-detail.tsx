'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Mail, Phone } from 'lucide-react';
import { doctorIdSchema, formatBangladeshPhone, type Doctor } from '@doctor-tracker/shared';
import { DoctorPatients } from '../patients/patients';
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
            <section className="doctor-profile" aria-labelledby="doctor-profile-name">
              <div className="doctor-profile-heading">
                <h1 id="doctor-profile-name" className="doctor-detail-name">
                  {record.name}
                </h1>
                <p>
                  <span className="specialization-tag">{record.specialization}</span>
                  <span>{record.hospital}</span>
                </p>
              </div>
              <div className="doctor-profile-contact">
                <a href={`tel:${record.phone.replace(/[^\d+]/g, '')}`}>
                  <Phone size={17} aria-hidden="true" />
                  <span>{formatBangladeshPhone(record.phone)}</span>
                </a>
                <a href={`mailto:${record.email}`}>
                  <Mail size={17} aria-hidden="true" />
                  <span>{record.email}</span>
                </a>
              </div>
              <p className="doctor-profile-date">
                Added <time dateTime={record.createdAt}>{doctorDate(record.createdAt)}</time>
              </p>
            </section>
            <DoctorPatients doctor={record} />
          </>
        )
      )}
    </div>
  );
}
