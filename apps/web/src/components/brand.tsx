import Link from 'next/link';

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand${inverse ? ' brand-inverse' : ''}`}
      aria-label="Doctor Tracker home"
    >
      <svg viewBox="0 0 40 40" width="40" height="40" fill="none" aria-hidden="true">
        <path d="M11 7h10c9 0 14 5 14 13s-5 13-14 13H11V7Z" stroke="currentColor" strokeWidth="3" />
        <path
          d="M5 20h10l4-7 5 14 4-7h7"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="5" cy="20" r="3" fill="currentColor" />
      </svg>
      <span>
        doctor<span className="brand-light">tracker</span>
        <span className="brand-period">.</span>
      </span>
    </Link>
  );
}
