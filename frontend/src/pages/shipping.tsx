import { AppLayout } from '../components/layout/AppLayout';
import { ComingSoon } from '../components/shared/ComingSoon';

export default function ShippingPage() {
  return (
    <AppLayout title="Shipping" subtitle="Shipment tracking and dispatch">
      <ComingSoon icon="🚚" title="Shipping & Tracking" description="Manage shipments from India to USA, generate labels, and track packages end-to-end." phase="Phase 2" />
    </AppLayout>
  );
}
