import { AppLayout } from '../components/layout/AppLayout';
import { ComingSoon } from '../components/shared/ComingSoon';

export default function InventoryPage() {
  return (
    <AppLayout title="Inventory" subtitle="Stone and metal inventory management">
      <ComingSoon icon="💎" title="Stone & Metal Inventory" description="Track stone allocations, metal stock levels, and stone requests tied to each order." phase="Phase 2" />
    </AppLayout>
  );
}
