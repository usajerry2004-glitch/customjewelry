import { UserRole } from '../../database/entities/user.entity';

// Roles whose accounts are scoped to one factory/stone-supplier and therefore
// shouldn't see internal staff chatter that isn't addressed to them. Shared
// between MessagesService (REST fetch + search) and MessagesGateway (live
// broadcast) so a message hidden from a role over REST can't leak to that
// same role over the socket.
export const RESTRICTED_ROLES = [UserRole.FACTORY_MANAGER, UserRole.FACTORY_VIEWER, UserRole.STONE_MANAGER];

export function isMessageVisible(
  role: string,
  userId: string | undefined,
  message: { isInternal: boolean; authorId: string; mentions?: string[] },
): boolean {
  if (role === 'CUSTOMER') return !message.isInternal;
  if (RESTRICTED_ROLES.includes(role as UserRole)) {
    return !message.isInternal || message.authorId === userId || (message.mentions || []).includes(userId || '');
  }
  return true;
}
