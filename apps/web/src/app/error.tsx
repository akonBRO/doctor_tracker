'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="session-state">
      <div role="alert">
        <p className="eyebrow">CONNECTION INTERRUPTED</p>
        <h1>Let’s try that again.</h1>
        <p>The workspace could not be loaded. Please try again in a moment.</p>
        <button className="button" onClick={reset}>
          Try again
        </button>
        <Link className="quiet-link" href="/">
          Return home
        </Link>
      </div>
    </main>
  );
}
