import Link from 'next/link';
import {
  ArrowDown,
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  ChartNoAxesCombined,
  LockKeyhole,
  KeyRound,
  Check,
} from 'lucide-react';
import { Brand } from '../components/brand';

export default function Home() {
  return (
    <>
      <header className="site-header wrap">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#approach">The workspace</a>
          <a href="#security">Built on trust</a>
        </nav>
        <div className="header-actions">
          <Link href="/login" className="text-link">
            Log in <ArrowUpRight size={15} />
          </Link>
          <Link href="/signup" className="button button-small">
            Get started <ArrowRight size={15} />
          </Link>
        </div>
      </header>
      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-line" /> THE ADMINISTRATIVE SIDE OF CARE
            </p>
            <h1>
              Less scattered.
              <br />
              More <em>connected.</em>
            </h1>
            <p className="hero-description">
              A clearer workspace for the people behind patient care. Bring your doctors, patients,
              and day-to-day administration into focus.
            </p>
            <div className="hero-actions">
              <Link href="/login" className="button">
                Enter your workspace <ArrowUpRight size={19} />
              </Link>
              <a href="#approach" className="quiet-link">
                Take a closer look <ArrowDown size={16} />
              </a>
            </div>
            <p className="access-note">
              <LockKeyhole size={13} /> Invitation-only access. Authenticator-protected accounts.
            </p>
          </div>
          <div
            className="care-map"
            aria-label="An illustrative map showing doctors and patients connected in one workspace"
          >
            <div className="map-top">
              <span className="eyebrow">A MORE CONNECTED PRACTICE</span>
              <span className="map-index">FIG. 01</span>
            </div>
            <div className="map-canvas">
              <div className="map-orbit orbit-outer" />
              <div className="map-orbit orbit-inner" />
              <div className="map-cross cross-horizontal" />
              <div className="map-cross cross-vertical" />
              <div className="map-node node-doctors">
                <span className="map-node-icon">
                  <Stethoscope size={20} />
                </span>
                <span>
                  <strong>Doctors</strong>
                  <small>Your care network</small>
                </span>
              </div>
              <div className="map-center">
                <svg viewBox="0 0 40 40" width="57" height="57" fill="none" aria-hidden="true">
                  <path
                    d="M11 7h10c9 0 14 5 14 13s-5 13-14 13H11V7Z"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M5 20h10l4-7 5 14 4-7h7"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="5" cy="20" r="3" fill="currentColor" />
                </svg>
                <span>One clear view</span>
              </div>
              <div className="map-node node-patients">
                <span className="map-node-icon">
                  <UsersRound size={20} />
                </span>
                <span>
                  <strong>Patients</strong>
                  <small>Connected to their doctor</small>
                </span>
              </div>
              <span className="map-annotation annotation-left">ORGANIZE</span>
              <span className="map-annotation annotation-right">UNDERSTAND</span>
              <div className="map-tick tick-one" />
              <div className="map-tick tick-two" />
            </div>
            <div className="map-bottom">
              <span>
                <span className="status-dot" /> Thoughtfully organized. Secure by design.
              </span>
              <span className="map-caption">CONCEPTUAL WORKSPACE</span>
            </div>
          </div>
        </section>
        <div className="principles wrap">
          <p>
            Made for the work
            <br />
            <strong>that supports care.</strong>
          </p>
          <span>
            <Check size={16} /> Clear organization
          </span>
          <span>
            <Check size={16} /> Considered workflows
          </span>
          <span>
            <Check size={16} /> Protected access
          </span>
        </div>
        <section id="approach" className="overview wrap">
          <div className="section-intro">
            <p className="eyebrow">01 / THE WORKSPACE</p>
            <h2>
              Everything in context.
              <br />
              Nothing in the way.
            </h2>
            <p>
              A focused foundation for your practice’s records.
              <br className="desktop-break" /> Built around three connected areas.
            </p>
          </div>
          <div className="capabilities">
            {[
              {
                n: '01',
                icon: Stethoscope,
                title: 'The people providing care',
                description:
                  'An organized home for doctor profiles and their corresponding patients.',
                label: 'DOCTOR DIRECTORY',
              },
              {
                n: '02',
                icon: UsersRound,
                title: 'Every patient, connected',
                description:
                  'Patient records with a clear connection to the doctor responsible for their care.',
                label: 'PATIENT RECORDS',
              },
              {
                n: '03',
                icon: ChartNoAxesCombined,
                title: 'A more useful perspective',
                description:
                  'A dedicated place for understanding your practice through meaningful information.',
                label: 'PRACTICE OVERVIEW',
              },
            ].map((item) => (
              <article key={item.n}>
                <div className="capability-number">
                  {item.n}
                  <item.icon size={23} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="eyebrow">{item.label}</p>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
            <p className="scope-note">
              Doctor, patient, and reporting tools are being developed. Secure account access is
              available now.
            </p>
          </div>
        </section>
        <section id="security" className="security-section">
          <div className="wrap security-inner">
            <div>
              <p className="eyebrow">02 / BUILT ON TRUST</p>
              <h2>
                Care starts
                <br />
                with confidence.
              </h2>
              <p>
                Access is intentional. Every administrator joins by invitation and verifies their
                identity with an authenticator.
              </p>
              <Link href="/signup" className="light-link">
                Have an invitation? Set up your account <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="security-details">
              <div>
                <span className="security-icon">
                  <KeyRound size={21} />
                </span>
                <div>
                  <h3>An invitation, not an open door.</h3>
                  <p>Single-use invitations keep administrative access in the right hands.</p>
                </div>
              </div>
              <div>
                <span className="security-icon">
                  <ShieldCheck size={21} />
                </span>
                <div>
                  <h3>A second layer of certainty.</h3>
                  <p>
                    Authenticator verification is required before every new sign-in is complete.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer wrap">
        <Brand />
        <p>A clearer view of care.</p>
        <span>Doctor Tracker © {new Date().getFullYear()}</span>
      </footer>
    </>
  );
}
