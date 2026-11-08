import type { Metadata } from 'next';
import { CredentialsForm } from '../../../features/auth/credentials-form';
export const metadata: Metadata = { title: 'Join by invitation' };
export default function Page() {
  return <CredentialsForm mode="signup" />;
}
