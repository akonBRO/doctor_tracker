import Link from 'next/link';
import { AlertCircle, RotateCw } from 'lucide-react';
import type { ApiError } from '../../lib/api';

export function DoctorQueryError({ error, retry }: { error: ApiError; retry: () => void }) {
  return (
    <section className="doctor-message" role="alert">
      <AlertCircle size={24} />
      <h2>
        {error.status === 404
          ? 'Doctor not found'
          : error.status === 422
            ? 'Check your filters or doctor link'
            : error.status === 403
              ? 'Access is not available'
              : 'We couldn’t load these records'}
      </h2>
      <p>{error.message}</p>
      {error.fields && <p>{Object.values(error.fields).flat().join(' ')}</p>}
      <div>
        {![404, 422, 403].includes(error.status) && (
          <button className="button button-small" onClick={retry}>
            <RotateCw size={15} /> Try again
          </button>
        )}
        <Link href="/doctors" className="quiet-link">
          Back to doctors
        </Link>
      </div>
    </section>
  );
}
export function DoctorLoading() {
  return (
    <div className="doctor-loading" aria-busy="true">
      <p role="status">Loading doctor records…</p>
      <span />
      <span />
      <span />
    </div>
  );
}
