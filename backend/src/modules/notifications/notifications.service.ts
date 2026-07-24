import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { UserRole } from '../../database/entities/user.entity';

// Admin's bell icon is scoped to just these two things — being @mentioned, or
// a customer/factory posting a message that needs a response — rather than
// every internal status-change notification other roles get, so it doesn't
// drown in order-lifecycle noise. Other roles are unaffected.
const ADMIN_VISIBLE_TYPES = [NotificationType.MENTION, NotificationType.CUSTOMER_MESSAGE, NotificationType.FACTORY_MESSAGE];

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
  ) {}

  async create(type: NotificationType, title: string, message: string, orderId?: string, targetUserId?: string, isPriority?: boolean): Promise<Notification> {
    const notif = this.notifRepo.create({ type, title, message, orderId, targetUserId, isPriority });
    return this.notifRepo.save(notif);
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
