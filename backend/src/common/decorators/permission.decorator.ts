import { SetMetadata } from '@nestjs/common';
import { Permission } from '../permissions';

// Combined with @Roles() + RolesGuard on the same route: access is granted
// if the caller's role matches @Roles() OR they carry this permission as a
// per-user override (User.extraPermissions), even if their role alone
// wouldn't pass @Roles().
export const PERMISSION_KEY = 'permission';
export const RequiresPermission = (...permissions: Permission[]) => SetMetadata(PERMISSION_KEY, permissions);
