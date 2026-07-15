import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../../database/entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
  ) {}

  async create(type: NotificationType, title: string, message: string, orderId?: string, targetUserId?: string, isPriority?: boolean): Promise<Notification> {
    const notif = this.notifRepo.create({ type, title, message, orderId, targetUserId, isPriority });
    return this.notifRepo.save(notif);
  }

  async findAll(userId: string): Promise<Notification[]> {
    return this.notifRepo.createQueryBuilder('n')
      .where('n.targetUserId = :uid', { uid: userId })
      .orderBy('n.createdAt', 'DESC')
      .take(50)
      .getMany();
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

  async unreadCount(userId: string): Promise<number> {
    return this.notifRepo.createQueryBuilder('n')
      .where('n.targetUserId = :uid', { uid: userId })
      .andWhere('n.isRead = :r', { r: false })
      .getCount();
  }
}
