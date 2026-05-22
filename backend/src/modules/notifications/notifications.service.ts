import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../../database/entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
  ) {}

  async create(type: NotificationType, title: string, message: string, orderId?: string, targetUserId?: string): Promise<Notification> {
    const notif = this.notifRepo.create({ type, title, message, orderId, targetUserId });
    return this.notifRepo.save(notif);
  }

  async findAll(userId?: string): Promise<Notification[]> {
    const qb = this.notifRepo.createQueryBuilder('n').orderBy('n.createdAt', 'DESC').take(50);
    if (userId) qb.where('n.targetUserId = :uid OR n.targetUserId IS NULL', { uid: userId });
    return qb.getMany();
  }

  async markRead(id: string): Promise<Notification> {
    await this.notifRepo.update(id, { isRead: true });
    return this.notifRepo.findOne({ where: { id } });
  }

  async markAllRead(userId?: string): Promise<void> {
    const qb = this.notifRepo.createQueryBuilder().update().set({ isRead: true });
    if (userId) qb.where('targetUserId = :uid OR targetUserId IS NULL', { uid: userId });
    await qb.execute();
  }

  async unreadCount(userId?: string): Promise<number> {
    const qb = this.notifRepo.createQueryBuilder('n').where('n.isRead = :r', { r: false });
    if (userId) qb.andWhere('(n.targetUserId = :uid OR n.targetUserId IS NULL)', { uid: userId });
    return qb.getCount();
  }
}
