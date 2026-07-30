// Per-user permission overrides — grants a specific extra capability to an
// individual account without changing their role. Additive only: a role's
// own @Roles() access never shrinks because of this list, it only grows.
export enum Permission {
  ASSIGN_SUPPLIER = 'ASSIGN_SUPPLIER',
  BULK_DELETE_ORDERS = 'BULK_DELETE_ORDERS',
  BULK_STATUS_NUDGE = 'BULK_STATUS_NUDGE',
  MARK_STONE_RECEIVED = 'MARK_STONE_RECEIVED',
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.ASSIGN_SUPPLIER]: 'Assign factory / stone supplier to orders',
  [Permission.BULK_DELETE_ORDERS]: 'Permanently delete orders',
  [Permission.BULK_STATUS_NUDGE]: 'Bulk-move orders between stages',
  [Permission.MARK_STONE_RECEIVED]: 'Mark Stone Creations-supplied orders as stone received, even ones manufactured at a different factory',
};
