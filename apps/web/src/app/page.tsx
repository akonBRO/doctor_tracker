import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Brand } from '../components/brand';

export default function Home() {
  return (
    <div className="public-page">
      <header className="public-header">
        <Brand />
        <nav aria-label="Main navigation">
          <Link href="/signup" className="quiet-link">
            Have an invitation?
          </Link>
        </nav>
      </header>
      <main id="main" className="public-main">
        <section className="public-hero" aria-labelledby="welcome-title">
          <div className="hero-symbol" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none">
              <path
                d="M11 7h10c9 0 14 5 14 13s-5 13-14 13H11V7Z"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                d="M5 20h10l4-7 5 14 4-7h7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="5" cy="20" r="3" fill="currentColor" />
            </svg>
          </div>
          <h1 id="welcome-title">Doctor Tracker</h1>
          <p className="hero-description">Manage doctors and patient records in one place.</p>
          <Link href="/login" className="button hero-login">
            Log in <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <footer className="public-footer">Doctor & patient management</footer>
    </div>
  );
}
