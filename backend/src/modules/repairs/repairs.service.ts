import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';

@Injectable()
export class RepairsService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)  private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getQueue() {
    return this.orderRepo.find({
      where: { status: OrderStatus.REPAIR },
      order: { updatedAt: 'ASC' },
    });
  }

  async getMetrics() {
    const total = await this.orderRepo.count({ where: { status: OrderStatus.REPAIR } });
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const overdue = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.status = :status', { status: OrderStatus.REPAIR })
      .andWhere('o.updatedAt < :date', { date: oneDayAgo })
      .getCount();
    return { total, overdue };
  }

  async complete(id: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.REPAIR) {
      throw new BadRequestException('Order must be in REPAIR status to complete repair');
    }

    order.status = OrderStatus.COMPLETED;
    const saved = await this.orderRepo.save(order);

    const recipients = await this.userRepo.find({
      where: { role: In([UserRole.AUTHORIZER]) },
    });
    await Promise.all(
      recipients.map(u =>
        this.notificationsService.create(
          NotificationType.STATUS_CHANGED,
          `Repair Complete — ${order.poNumber}`,
          `Order ${order.poNumber} repair has been completed${order.repairContractor ? ` by ${order.repairContractor}` : ''}.`,
          order.id,
          u.id,
        ),
      ),
    );

    return saved;
  }

  async assign(id: string, contractor: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.REPAIR) {
      throw new BadRequestException('Order must be in REPAIR status to assign a contractor');
    }
    order.repairContractor = contractor;
    return this.orderRepo.save(order);
  }
}
