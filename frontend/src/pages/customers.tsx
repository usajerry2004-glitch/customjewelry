import { AppLayout } from '../components/layout/AppLayout';
import { ComingSoon } from '../components/shared/ComingSoon';

export default function CustomersPage() {
  return (
    <AppLayout title="Customers" subtitle="Customer and store management">
      <ComingSoon icon="👥" title="Customer Management" description="Manage store accounts, customer profiles, contact history, and order preferences." phase="Phase 2" />
    </AppLayout>
  );
}
