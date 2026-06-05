import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';

export interface PeriodReport {
  period: string;
  from: string;
  to: string;
  totalOrders: number;
  newOrders: number;
  completedOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  byStatus: { status: string; count: number }[];
  topStores: { store: string; count: number }[];
  avgDaysToDelivery: number | null;
  totalRevenue: number;
}

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    @InjectRepository(Order)        private orderRepo: Repository<Order>,
    @InjectRepository(User)         private userRepo: Repository<User>,
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
  ) {}

  private getRange(period: 'week' | 'month' | 'last_month', customFrom?: string, customTo?: string) {
    const now = new Date();
    let from: Date, to: Date;

    if (customFrom && customTo) {
      from = new Date(customFrom);
      to   = new Date(customTo);
      to.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      from = new Date(now);
      from.setDate(now.getDate() - 7);
      to = now;
    } else if (period === 'last_month') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else {
      // This month
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to   = now;
    }
    return { from, to };
  }

  async getReport(
    period: 'week' | 'month' | 'last_month' = 'month',
    customFrom?: string,
    customTo?: string,
  ): Promise<PeriodReport> {
    const { from, to } = this.getRange(period, customFrom, customTo);

    const [newOrders, completedOrders, cancelledOrders, allActive] = await Promise.all([
      this.orderRepo.count({ where: { createdAt: Between(from, to) } }),
      this.orderRepo.count({ where: { status: OrderStatus.COMPLETED, updatedAt: Between(from, to) } }),
      this.orderRepo.count({ where: { status: OrderStatus.CANCELLED, updatedAt: Between(from, to) } }),
      this.orderRepo.count({ where: { createdAt: LessThan(to) } }),
    ]);

    // Orders by status snapshot
    const byStatusRaw = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('o.status')
      .getRawMany();

    const byStatus = byStatusRaw
      .map(r => ({ status: r.status, count: parseInt(r.count, 10) }))
      .sort((a, b) => b.count - a.count);

    // Top stores by orders created in period
    const topStoresRaw = await this.orderRepo
      .createQueryBuilder('o')
      .select("COALESCE(o.storeName, o.customerFullName, 'Unknown')", 'store')
      .addSelect('COUNT(*)', 'count')
      .where('o.createdAt BETWEEN :from AND :to', { from, to })
      .groupBy("COALESCE(o.storeName, o.customerFullName, 'Unknown')")
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();

    const topStores = topStoresRaw.map(r => ({ store: r.store, count: parseInt(r.count, 10) }));

    // Average days to delivery (for orders delivered in this period)
    const deliveredInPeriod = await this.orderRepo.find({
      where: { status: OrderStatus.COMPLETED, updatedAt: Between(from, to) },
      select: ['createdAt', 'updatedAt'],
    });

    let avgDaysToDelivery: number | null = null;
    if (deliveredInPeriod.length > 0) {
      const totalDays = deliveredInPeriod.reduce((sum, o) => {
        return sum + (new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime()) / 86400000;
      }, 0);
      avgDaysToDelivery = Math.round(totalDays / deliveredInPeriod.length);
    }

    // Total revenue (sum of quotedCost for delivered orders in period)
    const revenueRaw = await this.orderRepo
      .createQueryBuilder('o')
      .select('SUM(o.quotedCost)', 'total')
      .where('o.status = :s', { s: OrderStatus.COMPLETED })
      .andWhere('o.updatedAt BETWEEN :from AND :to', { from, to })
      .getRawOne();

    const totalRevenue = parseFloat(revenueRaw?.total || '0') || 0;

    const periodLabel = customFrom
      ? `${customFrom} → ${customTo}`
      : period === 'week' ? 'Last 7 days' : period === 'last_month' ? 'Last month' : 'This month';

    return {
      period: periodLabel,
      from: from.toISOString(),
      to: to.toISOString(),
      totalOrders: allActive,
      newOrders,
      completedOrders,
      activeOrders: allActive - completedOrders - cancelledOrders,
      cancelledOrders,
      byStatus,
      topStores,
      avgDaysToDelivery,
      totalRevenue,
    };
  }

  // Runs every Monday at 8:00 AM — creates a notification for all admins
  @Cron('0 8 * * 1')
  async generateWeeklyReport() {
    this.logger.log('Generating weekly report…');
    const report = await this.getReport('week');
    const admins = await this.userRepo.find({ where: { role: UserRole.ADMIN, isActive: true }, select: ['id'] });

    const summary = `Last 7 days: ${report.newOrders} new orders, ${report.completedOrders} delivered, $${report.totalRevenue.toLocaleString()} revenue.`;

    for (const admin of admins) {
      await this.notifRepo.save(this.notifRepo.create({
        type: NotificationType.WEEKLY_REPORT,
        title: '📊 Weekly Report Ready',
        message: summary,
        targetUserId: admin.id,
      }));
    }
    this.logger.log('Weekly report notifications sent to admins');
  }
}
