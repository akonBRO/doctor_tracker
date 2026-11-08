import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
export function WorkspaceFoundation({ area }: { area: 'dashboard' | 'doctors' | 'patients' }) {
  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <h1>{area === 'dashboard' ? 'Dashboard' : area}</h1>
        <p>Open a registry to manage your records.</p>
      </div>
      <div className="dashboard-links">
        <Link href="/doctors">
          <span>01</span>
          <div>
            <h2>Doctors</h2>
            <p>Practice details and assigned patients</p>
          </div>
          <ArrowUpRight />
        </Link>
        <Link href="/patients">
          <span>02</span>
          <div>
            <h2>Patients</h2>
            <p>Search, edit and manage patient records</p>
          </div>
          <ArrowUpRight />
        </Link>
      </div>
      <section className="analytics-placeholder">
        <h2>Analytics</h2>
        <p>Reporting will be available in a future update.</p>
      </section>
    </div>
  );
}
