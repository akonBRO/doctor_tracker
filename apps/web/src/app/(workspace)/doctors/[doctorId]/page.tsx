import type { Metadata } from 'next';
import { DoctorDetailPage } from '../../../../features/doctors/doctor-detail';
export const metadata: Metadata = { title: 'Doctor details' };
export default async function Page({ params }: { params: Promise<{ doctorId: string }> }) {
  const { doctorId } = await params;
  return <DoctorDetailPage doctorId={doctorId} />;
}
