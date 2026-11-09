import Link from 'next/link';
import { ArrowRight, Plus, Stethoscope, UsersRound } from 'lucide-react';

export function WorkspaceFoundation({ area }: { area: 'dashboard' | 'doctors' | 'patients' }) {
  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <h1>{area === 'dashboard' ? 'Dashboard' : area}</h1>
        <p>What would you like to do?</p>
      </div>
      <div className="dashboard-links">
        <section>
          <Stethoscope className="dashboard-section-icon" size={28} strokeWidth={1.6} />
          <h2>Doctors</h2>
          <p>Find a doctor and their patients.</p>
          <Link href="/doctors" className="dashboard-open">
            Browse doctors <ArrowRight size={18} />
          </Link>
          <Link href="/doctors/new" className="dashboard-add">
            <Plus size={18} /> Add doctor
          </Link>
        </section>
        <section>
          <UsersRound className="dashboard-section-icon" size={28} strokeWidth={1.6} />
          <h2>Patients</h2>
          <p>Register patients and update their records.</p>
          <Link href="/patients" className="dashboard-open">
            Browse patients <ArrowRight size={18} />
          </Link>
          <Link href="/patients/new" className="dashboard-add">
            <Plus size={18} /> Add patient
          </Link>
        </section>
      </div>
    </div>
  );
}
