import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';

// Days a status can stay unchanged before it's considered overdue
const SLA_RULES: { status: OrderStatus; maxDays: number; role: UserRole; label: string }[] = [
  { status: OrderStatus.CAD_IN_PROGRESS,   maxDays: 1,  role: UserRole.CAD_DESIGNER,     label: 'CAD In Progress' },
  { status: OrderStatus.SKU_CREATION,      maxDays: 1,  role: UserRole.SKU_MANAGER,      label: 'SKU Creation' },
  { status: OrderStatus.VPO_ISSUED,        maxDays: 4,  role: UserRole.FACTORY_MANAGER,  label: 'VPO Issued' },
  { status: OrderStatus.VPO_ISSUED,        maxDays: 1,  role: UserRole.STONE_MANAGER,    label: 'Stone Pending' },
  { status: OrderStatus.MANUFACTURED,      maxDays: 2,  role: UserRole.ADMIN,            label: 'Manufactured — pending dispatch' },
  { status: OrderStatus.REPAIR,            maxDays: 1,  role: UserRole.AUTHORIZER,       label: 'With Repair Contractor' },
];

// Separate rule for CAD files awaiting customer approval (checked on CadFile updatedAt)
export const CUSTOMER_REVIEW_SLA_DAYS = 5;

@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(
    @InjectRepository(Order)       private orderRepo: Repository<Order>,
    @InjectRepository(User)        private userRepo: Repository<User>,
    @InjectRepository(Notification)private notifRepo: Repository<Notification>,
  ) {}

  // Run every day at 9:00 AM — notifies Admin and Authorizer about orders > 10 days old
  @Cron('0 9 * * *')
  async checkSla() {
    this.logger.log('Running SLA check…');
    let alertCount = 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 10);
    const FINAL = [OrderStatus.COMPLETED, OrderStatus.CANCELLED];

    const overdueOrders = await this.orderRepo.find({
      where: { isArchived: false, createdAt: LessThan(cutoff) },
      select: ['id', 'poNumber', 'status', 'createdAt'],
    });

    const activeOverdue = overdueOrders.filter(o => !FINAL.includes(o.status));
    if (activeOverdue.length === 0) return 0;

    // Only notify Admin and Authorizer
    const targets = await this.userRepo.find({
      where: [{ role: UserRole.ADMIN, isActive: true }, { role: UserRole.AUTHORIZER, isActive: true }],
      select: ['id'],
    });

    for (const order of activeOverdue) {
      const daysOld = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 86400000);
      for (const user of targets) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const existing = await this.notifRepo
          .createQueryBuilder('n')
          .where('n.orderId = :oid', { oid: order.id })
          .andWhere('n.targetUserId = :uid', { uid: user.id })
          .andWhere('n.type = :t', { t: NotificationType.SLA_OVERDUE })
          .andWhere('n.createdAt >= :today', { today })
          .getOne();
        if (existing) continue;
        await this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.SLA_OVERDUE,
          title: `⚠️ SLA Overdue — ${order.poNumber}`,
          message: `Order ${order.poNumber} is ${daysOld} days old and still not completed. Please review.`,
          orderId: order.id,
          targetUserId: user.id,
        }));
        alertCount++;
      }
    }

    this.logger.log(`SLA check complete — ${alertCount} alerts created`);
    return alertCount;
  }

  // Return orders currently overdue (for dashboard widget + badges)
  // Orders older than 10 days (from creation) that are not yet completed or cancelled.
  // Days counted from order createdAt — visible to Admin and Authorizer only.
  async getOverdueOrders(): Promise<{ id: string; poNumber: string; storeName: string; status: string; daysOld: number; slaLabel: string }[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 10);

    const orders = await this.orderRepo.find({
      where: { isArchived: false, createdAt: LessThan(cutoff) },
      select: ['id', 'poNumber', 'storeName', 'customerFullName', 'status', 'createdAt'],
    });

    const FINAL = [OrderStatus.COMPLETED, OrderStatus.CANCELLED];

    return orders
      .filter(o => !FINAL.includes(o.status))
      .map(o => ({
        id:       o.id,
        poNumber: o.poNumber,
        storeName: o.storeName || (o as any).customerFullName || '—',
        status:   o.status,
        daysOld:  Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000),
        slaLabel: (o.storeName || (o as any).customerFullName || o.poNumber),
      }))
      .sort((a, b) => b.daysOld - a.daysOld);
  }

  // Trigger manually (admin can run from dashboard)
  async runNow() {
    return this.checkSla();
  }
}
