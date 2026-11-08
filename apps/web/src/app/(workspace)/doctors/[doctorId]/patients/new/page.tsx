import { PatientEditorPage } from '../../../../../../features/patients/patients';
export const metadata = { title: 'Add patient' };
export default async function Page({ params }: { params: Promise<{ doctorId: string }> }) {
  const { doctorId } = await params;
  return <PatientEditorPage doctorId={doctorId} />;
}
