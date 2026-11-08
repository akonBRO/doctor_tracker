import type { Metadata } from 'next';
import { CredentialsForm } from '../../../features/auth/credentials-form';
export const metadata: Metadata = { title: 'Log in' };
export default function Page() {
  return <CredentialsForm mode="login" />;
}
