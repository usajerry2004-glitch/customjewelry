import { AppLayout } from '../components/layout/AppLayout';
import { ComingSoon } from '../components/shared/ComingSoon';

export default function AnalyticsPage() {
  return (
    <AppLayout title="Analytics" subtitle="Revenue, volume, and turnaround metrics">
      <ComingSoon icon="📊" title="Analytics & Reporting" description="Revenue dashboards, order volume trends, turnaround time analysis, and vendor performance metrics." phase="Phase 3" />
    </AppLayout>
  );
}
