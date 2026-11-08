import { ArrowUpRight, Check, ChartNoAxesCombined, Stethoscope, UsersRound } from 'lucide-react';
import Link from 'next/link';

const content = {
  dashboard: {
    eyebrow: 'YOUR WORKSPACE',
    title: 'A clear place to begin.',
    text: 'Your administrative workspace is ready. Your account is protected, and the foundations are in place.',
    icon: ChartNoAxesCombined,
    area: 'Practice overview',
    note: 'Reporting and analytics will be available in a later stage. No practice statistics have been collected or displayed.',
  },
  doctors: {
    eyebrow: 'CARE NETWORK',
    title: 'The people providing care.',
    text: 'A dedicated home for your doctor directory and each doctor’s patient relationships.',
    icon: Stethoscope,
    area: 'Doctor directory',
    note: 'Doctor creation, search, filters, and patient relationships are planned for the next development stages.',
  },
  patients: {
    eyebrow: 'PATIENT ORGANIZATION',
    title: 'Every record, in context.',
    text: 'A dedicated home for patient records, connected to the doctor responsible for their care.',
    icon: UsersRound,
    area: 'Patient records',
    note: 'Patient management, editing, searching, filtering, and pagination are planned for later development stages.',
  },
};
export function WorkspaceFoundation({ area }: { area: keyof typeof content }) {
  const page = content[area];
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <p>{page.text}</p>
      </div>
      <section className="foundation-panel">
        <div className="foundation-panel-title">
          <page.icon size={22} strokeWidth={1.5} />
          <h2>{page.area}</h2>
          <span>In development</span>
        </div>
        <div className="foundation-panel-body">
          <p className="eyebrow">A THOUGHTFUL FOUNDATION</p>
          <h3>Ready for what comes next.</h3>
          <p>{page.note}</p>
          <p className="foundation-note">
            This area is intentionally reserved for the next stage of Doctor Tracker.
          </p>
        </div>
      </section>
      {area === 'dashboard' && (
        <div className="account-ready">
          <div>
            <span className="ready-mark">
              <Check size={18} />
            </span>
            <div>
              <h2>Your access is set up.</h2>
              <p>Invitation verified · Account created · Authenticator enabled</p>
            </div>
          </div>
          <Link href="/doctors">
            Explore your workspace <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
    </>
  );
}
