import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main" className="session-state">
      <div>
        <p className="eyebrow">404 / PAGE NOT FOUND</p>
        <h1>Page not found</h1>
        <p>The page you’re looking for doesn’t exist.</p>
        <Link className="button" href="/">
          Back to Doctor Tracker
        </Link>
      </div>
    </main>
  );
}
