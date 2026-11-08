import type { Metadata } from 'next';
import { WorkspaceFoundation } from '../../../components/workspace-foundation';
export const metadata: Metadata = { title: 'Patients' };
export default function Page() {
  return <WorkspaceFoundation area="patients" />;
}
