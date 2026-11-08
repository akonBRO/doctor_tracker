import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Brand } from '../components/brand';
export default function Home() {
  return (
    <div className="public-page">
      <header className="public-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#records">About the registry</a>
          <Link href="/login" className="button">
            Log in <ArrowRight size={18} />
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className="public-hero">
          <p className="eyebrow">DOCTOR & PATIENT REGISTRY</p>
          <h1>
            A place for every record.
            <br />
            <span>A clear way to find it.</span>
          </h1>
          <p className="hero-description">
            Keep doctor details and patient records together in one administrative workspace.
          </p>
          <div className="hero-actions">
            <Link href="/login" className="button">
              Log in <ArrowRight size={18} />
            </Link>
            <Link href="/signup" className="text-link">
              Have an invitation?
            </Link>
          </div>
        </section>
        <section id="records" className="public-records">
          <div>
            <p className="eyebrow">THE WORKSPACE</p>
            <h2>
              Find the details.
              <br />
              Continue the work.
            </h2>
          </div>
          <div className="capability-list">
            <article>
              <span>01</span>
              <div>
                <h3>Doctor directory</h3>
                <p>
                  Find a doctor by name, specialization or hospital. Open their practice details and
                  assigned patients.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Patient records</h3>
                <p>
                  Add a patient under their doctor. Search the registry, update a condition and
                  manage each record.
                </p>
              </div>
            </article>
          </div>
        </section>
      </main>
      <footer className="public-footer">
        <Brand />
        <span>Practice administration</span>
        <Link href="/signup">Create an account with an invitation</Link>
      </footer>
    </div>
  );
}
