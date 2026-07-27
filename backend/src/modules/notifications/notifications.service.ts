import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { UserRole, User } from '../../database/entities/user.entity';
import { MutedOrderNotification } from '../../database/entities/muted-order-notification.entity';

// Admin's bell icon is scoped to just these two things — being @mentioned, or
// a customer/factory posting a message that needs a response — rather than
// every internal status-change notification other roles get, so it doesn't
// drown in order-lifecycle noise. Other roles are unaffected.
const ADMIN_VISIBLE_TYPES = [NotificationType.MENTION, NotificationType.CUSTOMER_MESSAGE, NotificationType.FACTORY_MESSAGE];

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    @InjectRepository(MutedOrderNotification) private readonly mutedRepo: Repository<MutedOrderNotification>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // Two self-service filters applied before a bell notification is ever
  // written, so every call site (messages, orders, manufacturing, shipping…)
  // is covered without each one needing to know about preferences.
  async create(type: NotificationType, title: string, message: string, orderId?: string, targetUserId?: string, isPriority?: boolean): Promise<Notification | null> {
    if (targetUserId && orderId) {
      const muted = await this.mutedRepo.findOne({ where: { userId: targetUserId, orderId } });
      if (muted) return null;
    }
    if (targetUserId) {
      const user = await this.userRepo.findOne({ where: { id: targetUserId }, select: ['id', 'notifyPriorityOnly'] });
      if (user?.notifyPriorityOnly && !isPriority) return null;
    }
    const notif = this.notifRepo.create({ type, title, message, orderId, targetUserId, isPriority });
    return this.notifRepo.save(notif);
  }

  async getPreferences(userId: string): Promise<{ emailNotificationsEnabled: boolean; notifyPriorityOnly: boolean; mutedOrderIds: string[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'emailNotificationsEnabled', 'notifyPriorityOnly'] });
    const muted = await this.mutedRepo.find({ where: { userId } });
    return {
      emailNotificationsEnabled: user?.emailNotificationsEnabled ?? true,
      notifyPriorityOnly: user?.notifyPriorityOnly ?? false,
      mutedOrderIds: muted.map(m => m.orderId),
    };
  }

  async updatePreferences(userId: string, dto: { emailNotificationsEnabled?: boolean; notifyPriorityOnly?: boolean }): Promise<void> {
    const patch: Partial<User> = {};
    if (dto.emailNotificationsEnabled !== undefined) patch.emailNotificationsEnabled = dto.emailNotificationsEnabled;
    if (dto.notifyPriorityOnly !== undefined) patch.notifyPriorityOnly = dto.notifyPriorityOnly;
    if (Object.keys(patch).length) await this.userRepo.update(userId, patch);
  }

  async muteOrder(userId: string, orderId: string): Promise<void> {
    const existing = await this.mutedRepo.findOne({ where: { userId, orderId } });
    if (!existing) await this.mutedRepo.save(this.mutedRepo.create({ userId, orderId }));
  }

  async unmuteOrder(userId: string, orderId: string): Promise<void> {
    await this.mutedRepo.delete({ userId, orderId });
  }

  async findAll(userId: string, role?: string): Promise<Notification[]> {
    const qb = this.notifRepo.createQueryBuilder('n')
      .where('n.targetUserId = :uid', { uid: userId });
    if (role === UserRole.ADMIN) qb.andWhere('n.type IN (:...types)', { types: ADMIN_VISIBLE_TYPES });
    return qb.orderBy('n.createdAt', 'DESC').take(50).getMany();
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notif = await this.notifRepo.findOne({ where: { id, targetUserId: userId } });
    if (!notif) return notif;
    await this.notifRepo.update(id, { isRead: true });
    return { ...notif, isRead: true };
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifRepo.createQueryBuilder()
      .update()
      .set({ isRead: true })
      .where('targetUserId = :uid', { uid: userId })
      .execute();
  }

  async dismiss(id: string, userId: string): Promise<void> {
    await this.notifRepo.delete({ id, targetUserId: userId });
  }

  async unreadCount(userId: string, role?: string): Promise<number> {
    const qb = this.notifRepo.createQueryBuilder('n')
      .where('n.targetUserId = :uid', { uid: userId })
      .andWhere('n.isRead = :r', { r: false });
    if (role === UserRole.ADMIN) qb.andWhere('n.type IN (:...types)', { types: ADMIN_VISIBLE_TYPES });
    return qb.getCount();
  }
}
