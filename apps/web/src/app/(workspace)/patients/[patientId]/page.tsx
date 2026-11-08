import { PatientDetailPage } from '../../../../features/patients/patients';
export const metadata = { title: 'Patient record' };
export default async function Page({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return <PatientDetailPage patientId={patientId} />;
}
