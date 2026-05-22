import { AppLayout } from '../components/layout/AppLayout';
import { ComingSoon } from '../components/shared/ComingSoon';

export default function ManufacturingPage() {
  return (
    <AppLayout title="Manufacturing" subtitle="India factory workflow">
      <ComingSoon icon="🏭" title="Manufacturing Workflow" description="Track VPO issuance, factory status updates, job bag creation, and production milestones from India." phase="Phase 2" />
    </AppLayout>
  );
}
