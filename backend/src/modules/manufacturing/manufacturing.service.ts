import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, StoneStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';

@Injectable()
export class ManufacturingService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)  private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getQueue() {
    const orders = await this.orderRepo.find({
      where: { status: OrderStatus.VPO_ISSUED },
    });

    // Sort: Stone Received first (ready for production), then Pending Stone (waiting)
    const priority = (o: Order): number => {
      if (o.stoneStatus === StoneStatus.STONE_RECEIVED) return 0;
      return 1; // pending/null stone — waiting
    };

    return orders.sort((a, b) => {
      const diff = priority(a) - priority(b);
      if (diff !== 0) return diff;
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    });
  }

  async markStoneSent(id: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.VPO_ISSUED) {
      throw new BadRequestException('Order must be in VPO_ISSUED status');
    }
    if (order.stoneStatus === StoneStatus.STONE_RECEIVED) {
      throw new BadRequestException('Stone has already been marked as sent');
    }

    // Stone sent = stone received on factory side, no manual action needed from factory
    order.stoneStatus = StoneStatus.STONE_RECEIVED;
    const saved = await this.orderRepo.save(order);

    // Notify all Factory Managers — portal auto-shows Stone Received
    const factoryManagers = await this.userRepo.find({ where: { role: UserRole.FACTORY_MANAGER } });
    await Promise.all(
      factoryManagers.map(u =>
        this.notificationsService.create(
          NotificationType.STONE_RECEIVED,
          `Stone Received — ${order.poNumber}`,
          `Stone for order ${order.poNumber} has been sent and is now marked as received. You can proceed with production.`,
          order.id,
          u.id,
        ),
      ),
    );

    return saved;
  }

  async completeManufacturing(id: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.VPO_ISSUED) {
      throw new BadRequestException('Order must be in VPO_ISSUED status to mark as manufactured');
    }
    if (order.stoneStatus !== StoneStatus.STONE_RECEIVED) {
      throw new BadRequestException('Stone must be received before marking order as manufactured');
    }
    order.status = OrderStatus.MANUFACTURED;
    order.processedDate = new Date();
    const saved = await this.orderRepo.save(order);

    await this.notificationsService.create(
      NotificationType.ORDER_IN_MANUFACTURING,
      `Manufactured — ${order.poNumber}`,
      `Order ${order.poNumber} has been manufactured and is en route to the US office.`,
      order.id,
      null,
    );

    return saved;
  }

  async getMetrics() {
    const inProgress   = await this.orderRepo.count({ where: { status: OrderStatus.VPO_ISSUED } });
    const manufactured = await this.orderRepo.count({ where: { status: OrderStatus.MANUFACTURED } });
    const pendingStone = await this.orderRepo.count({ where: { status: OrderStatus.VPO_ISSUED, stoneStatus: StoneStatus.PENDING_STONE } });
    return { inProgress, manufactured, pendingStone };
  }
}
