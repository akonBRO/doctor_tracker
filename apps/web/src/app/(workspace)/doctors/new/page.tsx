import type { Metadata } from 'next';
import { CreateDoctorPage } from '../../../../features/doctors/create-doctor';
export const metadata: Metadata = { title: 'Add Doctor' };
export default function Page() {
  return <CreateDoctorPage />;
}
