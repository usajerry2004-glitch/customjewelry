import { AppLayout } from '../components/layout/AppLayout';
import { ComingSoon } from '../components/shared/ComingSoon';

export default function SettingsPage() {
  return (
    <AppLayout title="Settings" subtitle="System configuration">
      <ComingSoon icon="⚙️" title="System Settings" description="Configure roles, permissions, email notifications, integrations, and system-wide preferences." phase="Phase 3" />
    </AppLayout>
  );
}
