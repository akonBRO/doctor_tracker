'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { number, day } from './helpers';
import {
  DASHBOARD_PERIODS,
  dashboardOverviewSchema,
  dashboardDistributionSchema,
  dashboardTrendsSchema,
  type DashboardPeriod,
  type DashboardTrends,
} from '@doctor-tracker/shared';
import { useDoctorQuery } from '../doctors/use-doctor-query';
import { ApiError } from '../../lib/api';
import './dashboard.css';

const RegistrationPlot = dynamic(() => import('./registration-plot'), {
  ssr: false,
  loading: () => (
    <p className="analytics-state" role="status">
      Loading chart...
    </p>
  ),
});

function useAnalytics<T>(
  path: string | null,
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
  revision: number,
) {
  const query = useDoctorQuery<unknown>(path, 0, revision, true);
  const parsed = useMemo(
    () =>
      !path || query.error || (query.loading && query.data === undefined)
        ? undefined
        : schema.safeParse(query.data),
    [path, query.data, query.error, query.loading, schema],
  );
  return {
    ...query,
    data: parsed?.success ? parsed.data : undefined,
    error:
      query.error ??
      (parsed && !parsed.success
        ? new ApiError(
            502,
            'INVALID_ANALYTICS',
            'The dashboard received invalid data. Please try again.',
          )
        : undefined),
  };
}
function RequestState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error?: ApiError;
  retry: () => void;
}) {
  if (loading)
    return (
      <p className="analytics-state" role="status">
        Loading dashboard data…
      </p>
    );
  if (error)
    return (
      <div className="analytics-state analytics-error" role="alert">
        <p>{error.message}</p>
        <button className="secondary-button" onClick={retry}>
          Try again
        </button>
      </div>
    );
  return null;
}
function RegistrationChart({
  data,
  tableOpen,
  toggleTable,
}: {
  data: DashboardTrends;
  tableOpen: boolean;
  toggleTable: (open: boolean) => void;
}) {
  const totalDoctors = data.points.reduce((sum, point) => sum + point.doctors, 0);
  const totalPatients = data.points.reduce((sum, point) => sum + point.patients, 0);
  return (
    <>
      <p className="analytics-range">
        {day(data.from, true)} – {day(data.through, true)} · UTC days
      </p>
      <ul className="analytics-legend" aria-label="Registration series">
        <li>
          <span className="series-doctors" aria-hidden="true" />
          Doctors <strong>{number.format(totalDoctors)}</strong>
        </li>
        <li>
          <span className="series-patients" aria-hidden="true" />
          Patients <strong>{number.format(totalPatients)}</strong>
        </li>
      </ul>
      {totalDoctors + totalPatients === 0 ? (
        <div className="analytics-chart-empty">
          <h3>No registrations in this period</h3>
          <p>Choose another period to check earlier records.</p>
        </div>
      ) : (
        <div className="registration-chart" data-testid="registration-chart">
          <RegistrationPlot points={data.points} />
        </div>
      )}
      <details
        className="daily-counts"
        open={tableOpen}
        onToggle={(event) => toggleTable(event.currentTarget.open)}
      >
        <summary>View daily counts</summary>
        <div
          className="daily-counts-table"
          role="region"
          aria-label="Daily registration counts"
          tabIndex={0}
        >
          <table>
            <caption className="sr-only">
              Existing records grouped by their UTC creation date.
            </caption>
            <thead>
              <tr>
                <th scope="col">Date (UTC)</th>
                <th scope="col">Doctors</th>
                <th scope="col">Patients</th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{day(point.date, true)}</th>
                  <td>{number.format(point.doctors)}</td>
                  <td>{number.format(point.patients)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="analytics-footnote">
        Based on currently saved records. Deleted patients are excluded.
      </p>
    </>
  );
}
export function Dashboard() {
  const params = useSearchParams();
  const rawPeriod = params.get('period');
  const validPeriod =
    rawPeriod === null || DASHBOARD_PERIODS.includes(rawPeriod as DashboardPeriod);
  const period = (rawPeriod ?? '30d') as DashboardPeriod;
  const rawPage = params.get('doctorPage') ?? '1';
  const page = /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 10000 ? Number(rawPage) : 0;
  const [revision, setRevision] = useState(0);
  const [dailyCountsOpen, setDailyCountsOpen] = useState(false);
  const lastRefresh = useRef(0);
  const refresh = useCallback(() => {
    lastRefresh.current = Date.now();
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    lastRefresh.current = Date.now();
    const whenStale = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current >= 60_000)
        refresh();
    };
    const interval = setInterval(whenStale, 60_000);
    window.addEventListener('focus', whenStale);
    window.addEventListener('doctor-tracker-records-changed', refresh);
    document.addEventListener('visibilitychange', whenStale);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', whenStale);
      window.removeEventListener('doctor-tracker-records-changed', refresh);
      document.removeEventListener('visibilitychange', whenStale);
    };
  }, [refresh, revision]);
  const overview = useAnalytics('/dashboard/overview', dashboardOverviewSchema, revision);
  const trends = useAnalytics(
    validPeriod ? `/dashboard/trends?period=${period}` : null,
    dashboardTrendsSchema,
    revision,
  );
  const distribution = useAnalytics(
    page ? `/dashboard/patients-by-doctor?page=${page}&limit=5` : null,
    dashboardDistributionSchema,
    revision,
  );
  function change(key: string, value: string | null) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    window.history.replaceState(null, '', `/dashboard${next.size ? `?${next}` : ''}`);
  }
  const items = distribution.data?.items ?? [];
  const maximum = distribution.data?.maxPatientCount ?? 0;
  const pagination = distribution.data?.pagination;
  return (
    <div className="analytics-dashboard">
      <header className="analytics-page-heading">
        <h1>Dashboard</h1>
        <button
          className="secondary-button"
          onClick={refresh}
          disabled={overview.loading || trends.loading || distribution.loading}
        >
          {overview.loading || trends.loading || distribution.loading
            ? 'Refreshing…'
            : 'Refresh data'}
        </button>
      </header>
      <section
        className="analytics-totals"
        aria-label="All-time record totals"
        aria-busy={overview.loading}
      >
        <RequestState
          loading={overview.loading && !overview.data}
          error={overview.error}
          retry={overview.retry}
        />
        {overview.data && (
          <dl>
            <div>
              <dt>Total doctors</dt>
              <dd>
                <Link href="/doctors" aria-label={`${overview.data.totalDoctors} total doctors`}>
                  {number.format(overview.data.totalDoctors)}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Total patients</dt>
              <dd>
                <Link href="/patients" aria-label={`${overview.data.totalPatients} total patients`}>
                  {number.format(overview.data.totalPatients)}
                </Link>
              </dd>
            </div>
          </dl>
        )}
      </section>
      <div className="analytics-columns">
        <section
          className="analytics-panel"
          aria-labelledby="registrations-heading"
          aria-busy={trends.loading}
        >
          <div className="analytics-section-heading">
            <h2 id="registrations-heading">Registrations</h2>
            <div className="analytics-period">
              <label htmlFor="dashboard-period">Period</label>
              <select
                id="dashboard-period"
                value={validPeriod ? period : ''}
                onChange={(event) => change('period', event.target.value)}
              >
                {!validPeriod && <option value="">Choose a period</option>}
                {DASHBOARD_PERIODS.map((value) => (
                  <option key={value} value={value}>
                    Last {value.slice(0, -1)} days
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!validPeriod && (
            <p className="analytics-state" role="alert">
              Choose a valid reporting period.
            </p>
          )}
          <RequestState
            loading={trends.loading && !trends.data}
            error={trends.error}
            retry={trends.retry}
          />
          {trends.data && (
            <RegistrationChart
              data={trends.data}
              tableOpen={dailyCountsOpen}
              toggleTable={setDailyCountsOpen}
            />
          )}
        </section>
        <section
          className="analytics-panel"
          aria-labelledby="distribution-heading"
          aria-busy={distribution.loading}
        >
          <div className="analytics-section-heading">
            <h2 id="distribution-heading">Patients by doctor</h2>
          </div>
          <p className="analytics-range">Current assignments · Highest counts first</p>
          {!page && (
            <div className="analytics-state" role="alert">
              <p>This doctor distribution page is invalid.</p>
              <button className="secondary-button" onClick={() => change('doctorPage', null)}>
                Show first page
              </button>
            </div>
          )}
          <RequestState
            loading={distribution.loading && !distribution.data}
            error={distribution.error}
            retry={distribution.retry}
          />
          {distribution.data &&
            (items.length ? (
              <>
                <p className="distribution-caption">
                  Showing {number.format((pagination!.page - 1) * pagination!.limit + 1)}–
                  {number.format((pagination!.page - 1) * pagination!.limit + items.length)} of{' '}
                  {number.format(pagination!.totalItems)} doctors
                </p>
                <ol className="doctor-distribution" aria-label="Patient counts by doctor">
                  {items.map((item) => (
                    <li key={item.doctorId}>
                      <div className="doctor-bar-label">
                        <Link href={`/doctors/${item.doctorId}`}>{item.doctorName}</Link>
                        <span>
                          {number.format(item.patientCount)}{' '}
                          <span className="sr-only">
                            {item.patientCount === 1 ? 'patient' : 'patients'}
                          </span>
                        </span>
                      </div>
                      <div className="doctor-bar-track" aria-hidden="true">
                        <div
                          style={{ width: `${maximum ? (item.patientCount / maximum) * 100 : 0}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
                <nav className="distribution-pages" aria-label="Doctor distribution pages">
                  <button
                    className="secondary-button"
                    disabled={!pagination!.hasPreviousPage}
                    onClick={() => change('doctorPage', String(page - 1))}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page} of {pagination!.totalPages}
                  </span>
                  <button
                    className="secondary-button"
                    disabled={!pagination!.hasNextPage}
                    onClick={() => change('doctorPage', String(page + 1))}
                  >
                    Next
                  </button>
                </nav>
              </>
            ) : (
              <div className="analytics-empty">
                <h3>
                  {pagination!.totalItems ? 'No doctors on this page' : 'No doctors registered'}
                </h3>
                {pagination!.totalItems ? (
                  <button className="secondary-button" onClick={() => change('doctorPage', null)}>
                    Show first page
                  </button>
                ) : (
                  <p>Doctor records will appear here, including those with no patients.</p>
                )}
              </div>
            ))}
        </section>
      </div>
      {overview.data && (
        <p className="analytics-updated">
          Totals updated{' '}
          <time dateTime={overview.data.asOf}>
            {new Intl.DateTimeFormat('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Dhaka',
            }).format(new Date(overview.data.asOf))}
          </time>{' '}
          · Bangladesh time
        </p>
      )}
    </div>
  );
}
