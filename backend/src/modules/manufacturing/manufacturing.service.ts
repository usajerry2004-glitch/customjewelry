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
    return this.orderRepo.find({
      where: [
        { status: OrderStatus.VPO_ISSUED },
        { status: OrderStatus.PENDING_CONTRACTOR },
      ],
      order: { updatedAt: 'ASC' },
    });
  }

  async startProduction(id: string, details: { vpoNumber?: string; jobBagNumber?: string; notes?: string }) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.SKU_CREATION) {
      throw new BadRequestException('Order must be in SKU_CREATION status to start production');
    }

    order.status = OrderStatus.VPO_ISSUED;
    order.stoneStatus = StoneStatus.PENDING_STONE;
    if (details.vpoNumber)  order.rcVpoNumber    = details.vpoNumber;
    if (details.jobBagNumber) order.rcJobBagNumber = details.jobBagNumber;
    if (details.notes)      order.vpoOrderDetails = details.notes;
    const saved = await this.orderRepo.save(order);

    // Notify all Stone Managers
    const stoneManagers = await this.userRepo.find({ where: { role: UserRole.STONE_MANAGER } });
    await Promise.all(
      stoneManagers.map(u =>
        this.notificationsService.create(
          NotificationType.STONE_PENDING,
          `Stone Required — ${order.poNumber}`,
          `Order ${order.poNumber} has been issued a VPO and is waiting for stone confirmation. Please review and mark the stone as received once it arrives.`,
          order.id,
          u.id,
        ),
      ),
    );

    return saved;
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

  async moveToContractor(id: string, details: { jobBagNumber?: string; vendorName?: string }) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.VPO_ISSUED) {
      throw new BadRequestException('Order must be in VPO_ISSUED status');
    }
    if (order.stoneStatus !== StoneStatus.STONE_RECEIVED) {
      throw new BadRequestException('Stone must be received before moving to contractor');
    }
    order.status = OrderStatus.PENDING_CONTRACTOR;
    if (details.jobBagNumber) order.rcJobBagNumber = details.jobBagNumber;
    if (details.vendorName)   order.vendorName     = details.vendorName;
    return this.orderRepo.save(order);
  }

  async completeManufacturing(id: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.VPO_ISSUED && order.status !== OrderStatus.PENDING_CONTRACTOR) {
      throw new BadRequestException('Order must be in VPO_ISSUED or PENDING_CONTRACTOR to mark as ready to ship');
    }
    order.status = OrderStatus.READY_TO_SHIP;
    order.processedDate = new Date();
    const saved = await this.orderRepo.save(order);

    await this.notificationsService.create(
      NotificationType.ORDER_IN_MANUFACTURING,
      'Order Ready to Ship',
      `Order ${order.poNumber} has completed manufacturing and is ready for shipping.`,
      order.id,
      null,
    );

    if (order.customerId) {
      await this.notificationsService.create(
        NotificationType.ORDER_IN_MANUFACTURING,
        'Your order is ready!',
        `Great news! Your order ${order.poNumber} has been manufactured and is ready for shipping.`,
        order.id,
        order.customerId,
      );
    }

    return saved;
  }

  async getMetrics() {
    const inProgress        = await this.orderRepo.count({ where: { status: OrderStatus.VPO_ISSUED } });
    const withContractor    = await this.orderRepo.count({ where: { status: OrderStatus.PENDING_CONTRACTOR } });
    const readyToShip       = await this.orderRepo.count({ where: { status: OrderStatus.READY_TO_SHIP } });
    const pendingStone      = await this.orderRepo.count({ where: { status: OrderStatus.VPO_ISSUED, stoneStatus: StoneStatus.PENDING_STONE } });
    return { inProgress, withContractor, readyToShip, pendingStone };
  }
}
