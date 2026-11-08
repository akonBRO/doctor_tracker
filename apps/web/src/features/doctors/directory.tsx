'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, ArrowUpRight, Plus, Search, Stethoscope, X } from 'lucide-react';
import type { DoctorDirectory, DoctorOptions } from '@doctor-tracker/shared';
import { doctorSortSchema } from '@doctor-tracker/shared';
import { useDoctorQuery } from './use-doctor-query';
import { doctorDate } from './helpers';
import { DoctorLoading, DoctorQueryError } from './query-state';

export function DoctorDirectoryPage() {
  const params = useSearchParams();
  const query = params.toString();
  const { data, error, loading, retry } = useDoctorQuery<DoctorDirectory>(
    `/doctors${query ? `?${query}` : ''}`,
    300,
  );
  const returnTo = `/doctors${query ? `?${query}` : ''}`;
  const requestedLimit = Number(params.get('limit') ?? '10');
  const pageSizes = [
    ...new Set([
      10,
      25,
      50,
      ...(Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 50
        ? [requestedLimit]
        : []),
    ]),
  ].sort((a, b) => a - b);
  const hasFilters = ['q', 'specialization', 'hospital', 'from', 'to'].some(
    (key) => !!params.get(key),
  );
  function change(key: string, value: string, replace = false) {
    // Read the latest location so rapid changes cannot discard another filter.
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    const href = `/doctors${next.size ? `?${next}` : ''}`;
    if (replace) window.history.replaceState(null, '', href);
    else window.history.pushState(null, '', href);
  }
  function reset() {
    const next = new URLSearchParams();
    const sort = doctorSortSchema.safeParse(params.get('sort'));
    if (sort.success && sort.data !== 'newest') next.set('sort', sort.data);
    if (pageSizes.includes(requestedLimit) && requestedLimit !== 10)
      next.set('limit', String(requestedLimit));
    window.history.pushState(null, '', `/doctors${next.size ? `?${next}` : ''}`);
  }
  const details = (id: string) => `/doctors/${id}?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <div className="doctors-feature">
      <div className="doctor-page-heading">
        <div>
          <p className="eyebrow">DOCTOR REGISTRY</p>
          <h1>Doctors</h1>
          <p>Practice details and patient records.</p>
        </div>
        <Link className="button" href={`/doctors/new?returnTo=${encodeURIComponent(returnTo)}`}>
          <Plus size={17} /> Add Doctor
        </Link>
      </div>
      <section className="directory-filters" aria-label="Search and filter doctors">
        <div className="doctor-search field">
          <label htmlFor="doctor-search">Search doctors</label>
          <div>
            <Search size={18} />
            <input
              id="doctor-search"
              type="search"
              placeholder="Name, specialization or hospital"
              value={params.get('q') ?? ''}
              maxLength={120}
              onChange={(event) => change('q', event.target.value, true)}
            />
          </div>
          <p className="field-hint">Search word prefixes. Combine words to narrow results.</p>
        </div>
        <div className="doctor-sort field">
          <label htmlFor="doctor-sort">Sort by</label>
          <select
            id="doctor-sort"
            value={params.get('sort') ?? 'newest'}
            onChange={(event) => change('sort', event.target.value)}
          >
            <option value="newest">Newest added</option>
            <option value="oldest">Oldest added</option>
            <option value="name-asc">Name A–Z</option>
            <option value="name-desc">Name Z–A</option>
          </select>
        </div>
        <div className="doctor-filter-row">
          <OptionFilter
            field="specialization"
            label="Specialization"
            value={params.get('specialization') ?? ''}
            change={(value) => change('specialization', value, true)}
          />
          <OptionFilter
            field="hospital"
            label="Hospital"
            value={params.get('hospital') ?? ''}
            change={(value) => change('hospital', value, true)}
          />
          <div className="field">
            <label htmlFor="doctor-from">Added from (UTC)</label>
            <input
              id="doctor-from"
              type="date"
              value={params.get('from') ?? ''}
              onChange={(event) => change('from', event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="doctor-to">Added through (UTC)</label>
            <input
              id="doctor-to"
              type="date"
              value={params.get('to') ?? ''}
              min={params.get('from') ?? undefined}
              onChange={(event) => change('to', event.target.value)}
            />
          </div>
        </div>
        {(hasFilters || error?.status === 422) && (
          <button className="reset-filters" onClick={reset}>
            <X size={14} /> Reset filters
          </button>
        )}
      </section>
      {loading && <DoctorLoading />}
      {error && <DoctorQueryError error={error} retry={retry} />}
      {data && (
        <>
          <div className="directory-caption" aria-live="polite">
            <p>
              {data.pagination.totalItems
                ? data.items.length
                  ? `${(data.pagination.page - 1) * data.pagination.limit + 1}–${Math.min(data.pagination.page * data.pagination.limit, data.pagination.totalItems)} of ${data.pagination.totalItems} doctors`
                  : `${data.pagination.totalItems} doctors · no records on this page`
                : 'No doctor records to display'}
            </p>
            <label>
              Rows per page{' '}
              <select
                aria-label="Rows per page"
                value={params.get('limit') ?? '10'}
                onChange={(event) => change('limit', event.target.value)}
              >
                {pageSizes.map((limit) => (
                  <option key={limit} value={limit}>
                    {limit}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!data.items.length ? (
            <section className="doctor-message">
              <Stethoscope size={28} strokeWidth={1.5} />
              <h2>
                {data.pagination.totalItems
                  ? 'This page has no records'
                  : hasFilters
                    ? 'No matching doctors'
                    : 'No doctors yet'}
              </h2>
              <p>
                {data.pagination.totalItems
                  ? 'Return to the first page to see the available records.'
                  : hasFilters
                    ? 'Try different search words, adjust a filter, or reset your filters.'
                    : 'Add your first doctor using Add Doctor above. Their contact and practice details will appear here.'}
              </p>
              {data.pagination.totalItems > 0 && (
                <button className="button button-small" onClick={() => change('page', '1')}>
                  Go to first page
                </button>
              )}
            </section>
          ) : (
            <>
              <div className="doctor-table-wrap">
                <table className="doctor-table">
                  <caption className="sr-only">Doctors directory. Dates are shown in UTC.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Doctor</th>
                      <th scope="col">Specialization</th>
                      <th scope="col">Hospital</th>
                      <th scope="col">Contact</th>
                      <th scope="col">Added</th>
                      <th scope="col">
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((doctor) => (
                      <tr key={doctor.id}>
                        <td>
                          <Link className="doctor-name-link" href={details(doctor.id)}>
                            {doctor.name}
                          </Link>
                        </td>
                        <td>{doctor.specialization}</td>
                        <td>{doctor.hospital}</td>
                        <td className="doctor-contact">
                          <span>{doctor.phone}</span>
                          <span>{doctor.email}</span>
                        </td>
                        <td>
                          <time dateTime={doctor.createdAt}>{doctorDate(doctor.createdAt)}</time>
                        </td>
                        <td>
                          <Link
                            href={details(doctor.id)}
                            className="doctor-details-action"
                            aria-label={`View ${doctor.name}`}
                          >
                            <ArrowUpRight size={17} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="doctor-mobile-list">
                {data.items.map((doctor) => (
                  <article key={doctor.id}>
                    <div>
                      <Link href={details(doctor.id)} className="doctor-name-link">
                        {doctor.name}
                      </Link>
                      <Link
                        href={details(doctor.id)}
                        aria-label={`View ${doctor.name}`}
                        className="doctor-details-action"
                      >
                        <ArrowUpRight size={18} />
                      </Link>
                    </div>
                    <p className="mobile-specialization">{doctor.specialization}</p>
                    <dl>
                      <div>
                        <dt>Hospital</dt>
                        <dd>{doctor.hospital}</dd>
                      </div>
                      <div>
                        <dt>Phone</dt>
                        <dd>{doctor.phone}</dd>
                      </div>
                      <div>
                        <dt>Email</dt>
                        <dd>{doctor.email}</dd>
                      </div>
                      <div>
                        <dt>Added</dt>
                        <dd>
                          <time dateTime={doctor.createdAt}>{doctorDate(doctor.createdAt)}</time>
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}
          {data.pagination.totalPages > 0 && (
            <nav className="doctor-pagination" aria-label="Doctor directory pages">
              <button
                disabled={!data.pagination.hasPreviousPage}
                onClick={() => change('page', String(data.pagination.page - 1))}
              >
                <ArrowLeft size={15} /> Previous
              </button>
              <span>
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <button
                disabled={!data.pagination.hasNextPage}
                onClick={() => change('page', String(data.pagination.page + 1))}
              >
                Next <ArrowRight size={15} />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
function OptionFilter({
  field,
  label,
  value,
  change,
}: {
  field: 'specialization' | 'hospital';
  label: string;
  value: string;
  change: (value: string) => void;
}) {
  const [requested, setRequested] = useState(false);
  const options = useDoctorQuery<DoctorOptions>(
    requested ? `/doctors/options?${new URLSearchParams({ field, q: value })}` : null,
    300,
  );
  return (
    <div className="field">
      <label htmlFor={`filter-${field}`}>{label}</label>
      <input
        id={`filter-${field}`}
        list={`doctor-options-${field}`}
        value={value}
        placeholder={`Any ${field}`}
        maxLength={field === 'hospital' ? 160 : 100}
        onFocus={() => setRequested(true)}
        onChange={(event) => change(event.target.value)}
        autoComplete="off"
        aria-describedby={`hint-${field}`}
      />
      <datalist id={`doctor-options-${field}`}>
        {options.data?.values.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <p id={`hint-${field}`} className="field-hint">
        {options.error
          ? 'Suggestions unavailable. Enter an exact value.'
          : options.data?.hasMore
            ? 'Type to find more suggestions. Exact match.'
            : 'Exact match · type for suggestions'}
      </p>
    </div>
  );
}
