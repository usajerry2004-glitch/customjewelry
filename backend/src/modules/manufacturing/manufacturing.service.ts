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
        { status: OrderStatus.SKU_CREATION },
        { status: OrderStatus.VPO_ISSUED },
        { status: OrderStatus.ORDER_JOB_BAG_CREATED },
      ],
      order: { updatedAt: 'ASC' },
    });
  }

  async startProduction(id: string, details: { vpoNumber?: string; jobBagNumber?: string; notes?: string }) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.SKU_CREATION && order.status !== OrderStatus.CUSTOMER_APPROVED) {
      throw new BadRequestException('Order must be in SKU_CREATION or CUSTOMER_APPROVED status to start production');
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

  async confirmStoneReceived(id: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.VPO_ISSUED) {
      throw new BadRequestException('Order must be in VPO_ISSUED status to confirm stone');
    }
    if (order.stoneStatus === StoneStatus.STONE_RECEIVED) {
      throw new BadRequestException('Stone has already been marked as received');
    }

    order.stoneStatus = StoneStatus.STONE_RECEIVED;
    const saved = await this.orderRepo.save(order);

    // Notify all Factory Managers
    const factoryManagers = await this.userRepo.find({ where: { role: UserRole.FACTORY_MANAGER } });
    await Promise.all(
      factoryManagers.map(u =>
        this.notificationsService.create(
          NotificationType.STONE_RECEIVED,
          `Stone Received — ${order.poNumber}`,
          `The stone for order ${order.poNumber} has been received and confirmed. You can now proceed with production.`,
          order.id,
          u.id,
        ),
      ),
    );

    return saved;
  }

  async createJobBag(id: string, details: { jobBagNumber?: string; vendorName?: string }) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.VPO_ISSUED) {
      throw new BadRequestException('Order must be in VPO_ISSUED status to create job bag');
    }
    if (order.stoneStatus !== StoneStatus.STONE_RECEIVED) {
      throw new BadRequestException('Stone must be received before creating a job bag');
    }
    order.status = OrderStatus.ORDER_JOB_BAG_CREATED;
    if (details.jobBagNumber) order.rcJobBagNumber = details.jobBagNumber;
    if (details.vendorName)   order.vendorName     = details.vendorName;
    return this.orderRepo.save(order);
  }

  async completeManufacturing(id: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.ORDER_JOB_BAG_CREATED && order.status !== OrderStatus.VPO_ISSUED) {
      throw new BadRequestException('Order must be in production to mark as complete');
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
    const inProgress   = await this.orderRepo.count({ where: { status: OrderStatus.VPO_ISSUED } });
    const jobBagCreated = await this.orderRepo.count({ where: { status: OrderStatus.ORDER_JOB_BAG_CREATED } });
    const readyToShip  = await this.orderRepo.count({ where: { status: OrderStatus.READY_TO_SHIP } });
    const pendingStart = await this.orderRepo.count({ where: { status: OrderStatus.SKU_CREATION } });
    const pendingStone = await this.orderRepo.count({ where: { status: OrderStatus.VPO_ISSUED, stoneStatus: StoneStatus.PENDING_STONE } });
    return { pendingStart, inProgress, jobBagCreated, readyToShip, pendingStone };
  }
}
