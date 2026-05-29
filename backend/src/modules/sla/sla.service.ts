import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';

// Days a status can stay unchanged before it's considered overdue
const SLA_RULES: { status: OrderStatus; maxDays: number; role: UserRole; label: string }[] = [
  { status: OrderStatus.WAITING_CONFIRMATION, maxDays: 1,  role: UserRole.AUTHORIZER,       label: 'Waiting Confirmation' },
  { status: OrderStatus.PENDING_CAD,          maxDays: 3,  role: UserRole.CAD_DESIGNER,     label: 'Pending CAD' },
  { status: OrderStatus.CAD_IN_PROGRESS,      maxDays: 7,  role: UserRole.CAD_DESIGNER,     label: 'CAD In Progress' },
  { status: OrderStatus.SKU_CREATION,         maxDays: 2,  role: UserRole.SKU_MANAGER,      label: 'SKU Creation' },
  { status: OrderStatus.VPO_ISSUED,           maxDays: 3,  role: UserRole.FACTORY_MANAGER,  label: 'VPO Issued' },
  { status: OrderStatus.PENDING_CONTRACTOR,   maxDays: 5,  role: UserRole.FACTORY_MANAGER,  label: 'Pending Contractor' },
  { status: OrderStatus.ORDER_JOB_BAG_CREATED,maxDays: 21, role: UserRole.FACTORY_MANAGER,  label: 'Job Bag Created' },
  { status: OrderStatus.READY_TO_INVOICE,     maxDays: 2,  role: UserRole.SHIPPING_MANAGER, label: 'Ready to Invoice' },
  { status: OrderStatus.READY_TO_SHIP,        maxDays: 2,  role: UserRole.SHIPPING_MANAGER, label: 'Ready to Ship' },
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

  // Run every day at 9:00 AM
  @Cron('0 9 * * *')
  async checkSla() {
    this.logger.log('Running SLA check…');
    let alertCount = 0;

    for (const rule of SLA_RULES) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - rule.maxDays);

      const overdue = await this.orderRepo.find({
        where: { status: rule.status, updatedAt: LessThan(cutoff) },
        select: ['id', 'poNumber', 'status', 'updatedAt'],
      });

      if (overdue.length === 0) continue;

      const targets = await this.userRepo.find({
        where: { role: rule.role, isActive: true },
        select: ['id'],
      });
      // Also always notify admins
      const admins = await this.userRepo.find({
        where: { role: UserRole.ADMIN, isActive: true },
        select: ['id'],
      });
      const allTargets = [...new Map([...targets, ...admins].map(u => [u.id, u])).values()];

      for (const order of overdue) {
        const daysStuck = Math.floor((Date.now() - new Date(order.updatedAt).getTime()) / 86400000);
        for (const user of allTargets) {
          // Avoid duplicate notifications: check if we already sent one today for this order+status
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
            title: `⚠️ SLA Breach — ${order.poNumber}`,
            message: `Order ${order.poNumber} has been in "${rule.label}" for ${daysStuck} day${daysStuck !== 1 ? 's' : ''} (limit: ${rule.maxDays}d). Action required.`,
            orderId: order.id,
            targetUserId: user.id,
          }));
          alertCount++;
        }
      }
    }

    this.logger.log(`SLA check complete — ${alertCount} alerts created`);
    return alertCount;
  }

  // Return orders currently overdue (for dashboard widget + badges)
  async getOverdueOrders(): Promise<{ id: string; poNumber: string; status: string; daysOverdue: number; slaLabel: string }[]> {
    const results: { id: string; poNumber: string; status: string; daysOverdue: number; slaLabel: string }[] = [];

    for (const rule of SLA_RULES) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - rule.maxDays);
      const overdue = await this.orderRepo.find({
        where: { status: rule.status, updatedAt: LessThan(cutoff) },
        select: ['id', 'poNumber', 'status', 'updatedAt'],
      });
      for (const o of overdue) {
        const daysOverdue = Math.floor((Date.now() - new Date(o.updatedAt).getTime()) / 86400000) - rule.maxDays;
        results.push({ id: o.id, poNumber: o.poNumber, status: o.status, daysOverdue, slaLabel: rule.label });
      }
    }

    return results.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }

  // Trigger manually (admin can run from dashboard)
  async runNow() {
    return this.checkSla();
  }
}
