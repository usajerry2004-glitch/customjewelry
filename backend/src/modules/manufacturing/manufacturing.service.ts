import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, StoneStatus, SupplySource, Factory } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';
import { Permission } from '../../common/permissions';

@Injectable()
export class ManufacturingService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)  private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getQueue(user?: { role?: string; assignedFactory?: Factory | null; assignedSupplySource?: SupplySource | null; extraPermissions?: Permission[] }) {
    // Stone Manager / Factory Manager only ever see orders assigned to them
    // specifically — Admin/Authorizer see the full queue, including orders still
    // awaiting a supplier assignment.
    if (user?.role === UserRole.STONE_MANAGER) {
      const orders = await this.orderRepo
        .createQueryBuilder('o')
        .where('o.status = :s', { s: OrderStatus.VPO_ISSUED })
        .andWhere('o.supplySource = :assignedSupplySource', { assignedSupplySource: user.assignedSupplySource ?? null })
        .getMany();
      return this.sortQueue(orders);
    }
    if (user?.role === UserRole.FACTORY_MANAGER) {
      const q = this.orderRepo
        .createQueryBuilder('o')
        .where('o.status = :s', { s: OrderStatus.VPO_ISSUED });
      // MARK_STONE_RECEIVED override — this Factory Manager also receives
      // stone on Stone Creations orders regardless of which factory is
      // manufacturing them, not just their own assigned factory's orders.
      if (user.extraPermissions?.includes(Permission.MARK_STONE_RECEIVED)) {
        q.andWhere('(o.assignedFactory = :assignedFactory OR o.supplySource = :creations)', {
          assignedFactory: user.assignedFactory ?? null,
          creations: SupplySource.STONE_CREATIONS,
        });
      } else {
        q.andWhere('o.assignedFactory = :assignedFactory', { assignedFactory: user.assignedFactory ?? null });
      }
      const orders = await q.getMany();
      return this.sortQueue(orders);
    }

    const orders = await this.orderRepo.find({ where: { status: OrderStatus.VPO_ISSUED } });
    return this.sortQueue(orders);
  }

  private sortQueue(orders: Order[]): Order[] {
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

  async markStoneSent(id: string, user?: { role?: string; assignedFactory?: Factory | null; assignedSupplySource?: SupplySource | null; extraPermissions?: Permission[] }) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.VPO_ISSUED) {
      throw new BadRequestException('Order must be in VPO_ISSUED status');
    }
    if (order.stoneStatus === StoneStatus.STONE_RECEIVED) {
      throw new BadRequestException('Stone has already been marked as sent');
    }
    // Factory Manager may only mark receipt on their own Stone Creations orders —
    // Kira-supply stones stay Stone Manager's job. MARK_STONE_RECEIVED lifts the
    // "own factory only" restriction for a Factory Manager who's specifically
    // responsible for receiving Stone Creations diamonds across all factories.
    if (user?.role === UserRole.FACTORY_MANAGER) {
      if (order.supplySource !== SupplySource.STONE_CREATIONS) {
        throw new ForbiddenException('Only the Stone Manager can mark this order\'s stone as received.');
      }
      const canActAcrossFactories = user.extraPermissions?.includes(Permission.MARK_STONE_RECEIVED);
      if (!canActAcrossFactories && (!order.assignedFactory || order.assignedFactory !== user.assignedFactory)) {
        throw new NotFoundException(`Order ${id} not found`);
      }
    }
    if (user?.role === UserRole.STONE_MANAGER
        && (!order.supplySource || order.supplySource !== user.assignedSupplySource)) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    // Stone sent = stone received on factory side, no manual action needed from factory
    order.stoneStatus = StoneStatus.STONE_RECEIVED;
    const saved = await this.orderRepo.save(order);

    // Notify only the Factory Manager(s) assigned to this order's factory — not every
    // Factory Manager account in the system.
    const factoryManagers = await this.userRepo.find({ where: { role: UserRole.FACTORY_MANAGER, assignedFactory: order.assignedFactory } });
    await Promise.all(
      factoryManagers.map(u =>
        this.notificationsService.create(
          NotificationType.STONE_RECEIVED,
          `Stone Received — ${order.poNumber}`,
          `Stone for order ${order.poNumber} has been sent and is now marked as received. You can proceed with production.`,
          order.id,
          u.id,
          order.isPriorityCustomer,
        ),
      ),
    );

    return saved;
  }

  async completeManufacturing(id: string, user?: { role?: string; assignedFactory?: Factory | null }) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (user?.role === UserRole.FACTORY_MANAGER
        && (!order.assignedFactory || order.assignedFactory !== user.assignedFactory)) {
      throw new NotFoundException(`Order ${id} not found`);
    }
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
      order.isPriorityCustomer,
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
