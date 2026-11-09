'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut, Menu, Stethoscope, UsersRound, X } from 'lucide-react';
import type { AdminIdentity, AuthResponse } from '@doctor-tracker/shared';
import { api, ApiError } from '../lib/api';
import { Brand } from './brand';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
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
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const trigger = menuButton.current;
    const elements = () =>
      Array.from(
        navigation.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    elements()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(false);
      }
      if (event.key === 'Tab') {
        const targets = elements();
        const first = targets[0];
        const last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const resize = () => {
      if (window.innerWidth >= 768) setMenu(false);
    };
    document.addEventListener('keydown', keyboard);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', resize);
      trigger?.focus();
    };
  }, [menu]);
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
      <header className="mobile-bar" inert={menu}>
        <Brand />
        <button
          className="icon-button"
          ref={menuButton}
          aria-label={menu ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menu}
          aria-controls="admin-navigation"
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <aside
        ref={navigation}
        className={`sidebar${menu ? ' sidebar-open' : ''}`}
        role={menu ? 'dialog' : undefined}
        aria-modal={menu || undefined}
        aria-label={menu ? 'Workspace menu' : undefined}
      >
        <button
          className="icon-button sidebar-close"
          aria-label="Close workspace menu"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="sidebar-brand">
          <Brand />
        </div>
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
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="admin-identity">
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
      <div className="admin-main" inert={menu}>
        <main id="main" className="admin-page">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
