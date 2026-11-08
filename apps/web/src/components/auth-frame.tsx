import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Brand } from './brand';

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Brand inverse />
        <div className="auth-aside-copy">
          <p className="eyebrow">A CLEARER VIEW OF CARE</p>
          <h2>
            A considered space.
            <br />
            For work that matters.
          </h2>
          <p>
            Behind every patient is a team keeping things connected. This is your space to do that
            work.
          </p>
          <div className="auth-line-art" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <p className="aside-security">
          <ShieldCheck size={18} /> Protected access. A shared responsibility.
        </p>
      </aside>
      <div className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <Link href="/" className="back-link">
          <ArrowLeft size={15} /> Back to home
        </Link>
        <main id="main" className="auth-content">
          {children}
        </main>
        <footer className="auth-footer">
          <LockLabel /> Doctor Tracker · Administrative access
        </footer>
      </div>
    </div>
  );
}
function LockLabel() {
  return <ShieldCheck size={14} aria-hidden="true" />;
}
