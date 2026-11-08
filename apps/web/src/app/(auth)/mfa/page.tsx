import type { Metadata } from 'next';
import { MfaForm } from '../../../features/auth/mfa-form';
export const metadata: Metadata = { title: 'Verify your identity' };
export default function Page() {
  return <MfaForm />;
}
