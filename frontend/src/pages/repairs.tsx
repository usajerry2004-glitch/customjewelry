import { AppLayout } from '../components/layout/AppLayout';
import { ComingSoon } from '../components/shared/ComingSoon';

export default function RepairsPage() {
  return (
    <AppLayout title="Repairs" subtitle="US setter repair workflow">
      <ComingSoon icon="🔧" title="Repair Management" description="Track US setter jobs, stone setting, polishing, and final QC before customer delivery." phase="Phase 2" />
    </AppLayout>
  );
}
