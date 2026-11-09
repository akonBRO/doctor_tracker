import Link from 'next/link';
import { Brand } from './brand';
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Brand />
        <Link href="/" className="quiet-link">
          Back to home
        </Link>
      </header>
      <main id="main" className="auth-content">
        {children}
      </main>
    </div>
  );
}
