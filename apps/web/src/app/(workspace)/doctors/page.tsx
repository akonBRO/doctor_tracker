import type { Metadata } from 'next';
import { DoctorDirectoryPage } from '../../../features/doctors/directory';
export const metadata: Metadata = { title: 'Doctors' };
export default function Page() {
  return <DoctorDirectoryPage />;
}
