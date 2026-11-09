import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AdminIdentity, ApiEnvelope, AuthResponse } from '@doctor-tracker/shared';
import { AdminShell } from '../../components/admin-shell';
import { loadWebConfig } from '../../../config/environment';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const allowedNames = ['dt_access', 'dt_refresh', '__Host-dt_access', '__Host-dt_refresh'];
  const authCookies = jar.getAll().filter((cookie) => allowedNames.includes(cookie.name));
  if (!authCookies.length) redirect('/login');
  let admin: AdminIdentity | null = null;
  const { apiOrigin } = loadWebConfig();
  try {
    const response = await fetch(`${apiOrigin}/api/v1/auth/me`, {
      headers: {
        cookie: authCookies
          .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
          .join('; '),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const payload: ApiEnvelope<AuthResponse> = await response.json();
      admin = payload.data.admin;
    } else if (response.status !== 401)
      throw new Error('The authentication service is temporarily unavailable.');
  } catch {
    throw new Error('The authentication service is temporarily unavailable. Please try again.');
  }
  // Expired access cookies can only be refreshed in the browser, where Set-Cookie reaches the user.
  if (!admin && !authCookies.some((cookie) => cookie.name.endsWith('dt_refresh')))
    redirect('/login');
  return <AdminShell initialAdmin={admin}>{children}</AdminShell>;
}
