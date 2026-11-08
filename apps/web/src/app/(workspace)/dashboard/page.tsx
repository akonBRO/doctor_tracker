import type { Metadata } from 'next';
import { WorkspaceFoundation } from '../../../components/workspace-foundation';
export const metadata: Metadata = { title: 'Overview' };
export default function Page() {
  return <WorkspaceFoundation area="dashboard" />;
}
