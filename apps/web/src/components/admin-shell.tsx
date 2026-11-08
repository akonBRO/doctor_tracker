'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  LogOut,
  Menu,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  X,
} from 'lucide-react';
import type { AdminIdentity, AuthResponse } from '@doctor-tracker/shared';
import { api, ApiError } from '../lib/api';
import { Brand } from './brand';

const links = [
  { href: '/dashboard', label: 'Overview', icon: ChartNoAxesCombined },
  { href: '/doctors', label: 'Doctors', icon: Stethoscope },
  { href: '/patients', label: 'Patients', icon: UsersRound },
];
export function AdminShell({
  initialAdmin,
  children,
}: {
  initialAdmin: AdminIdentity | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentLink = links.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
  );
  const [admin, setAdmin] = useState(initialAdmin);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const restore = useCallback(async () => {
    try {
      const result = await api.get<AuthResponse>('/auth/me');
      setAdmin(result.admin);
      setError('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAdmin(null);
        router.replace('/login');
        router.refresh();
      } else {
        setAdmin(null);
        setError(err instanceof Error ? err.message : 'Unable to restore your session.');
      }
    }
  }, [router]);
  useEffect(() => {
    if (!initialAdmin) {
      void Promise.resolve().then(restore);
    }
    const onFocus = () => {
      if (document.visibilityState === 'visible') void restore();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void restore();
    }, 4 * 60_000);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [initialAdmin, restore]);
  async function logout() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/logout');
      setAdmin(null);
      router.replace('/login');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  if (!admin)
    return (
      <main id="main" className="session-state">
        <Brand />
        <div role={error ? 'alert' : 'status'}>
          <h1>{error ? 'We couldn’t connect.' : 'Opening your workspace…'}</h1>
          <p>{error || 'Restoring your secure session.'}</p>
          {error && (
            <button className="button" onClick={restore}>
              Try again
            </button>
          )}
          <Link href="/login" className="quiet-link">
            Return to sign in
          </Link>
        </div>
      </main>
    );
  return (
    <div className="admin-layout">
      <header className="mobile-bar">
        <Brand />
        <button
          className="icon-button"
          aria-label={menu ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menu}
          aria-controls="admin-navigation"
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <aside className={`sidebar${menu ? ' sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
        </div>
        <p className="eyebrow sidebar-caption">YOUR WORKSPACE</p>
        <nav id="admin-navigation" aria-label="Workspace navigation">
          {links.map((item) => (
            <Link
              key={item.href}
              className={currentLink?.href === item.href ? 'active' : ''}
              href={item.href}
              onClick={() => setMenu(false)}
              aria-current={currentLink?.href === item.href ? 'page' : undefined}
            >
              <item.icon size={19} />
              {item.label}
              {currentLink?.href === item.href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-security">
            <ShieldCheck size={18} />
            <span>Authenticator protected</span>
          </div>
          <div className="admin-identity">
            <span className="avatar">
              {admin.name
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </span>
            <div>
              <strong>{admin.name}</strong>
              <span>Administrator</span>
            </div>
          </div>
          <button className="logout-button" onClick={logout} disabled={busy}>
            <LogOut size={17} />
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <div className="admin-topbar">
          <p>
            Workspace <span>/</span> {currentLink?.label}
          </p>
          <Link href="/">
            Doctor Tracker <ArrowUpRight size={14} />
          </Link>
        </div>
        <main id="main" className="admin-page">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {children}
        </main>
        <footer className="admin-footer">
          <span>Doctor Tracker</span>
          <span>Secure administrative workspace</span>
        </footer>
      </div>
    </div>
  );
}
