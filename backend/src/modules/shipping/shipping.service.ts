import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';

@Injectable()
export class ShippingService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderEvent) private readonly eventRepo: Repository<OrderEvent>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getReadyToShip() {
    return this.orderRepo.find({
      where: { status: OrderStatus.MANUFACTURED },
      order: { updatedAt: 'ASC' },
    });
  }

  async getShipped() {
    return this.orderRepo.find({
      where: { status: OrderStatus.SHIPPED },
      order: { updatedAt: 'DESC' },
      take: 50,
    });
  }

  async dispatch(id: string, details: { trackingNumber?: string; shipMethod?: string }, user?: { id?: string; email: string }) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.MANUFACTURED) {
      throw new BadRequestException('Order must be in MANUFACTURED status to dispatch');
    }
    const fromStatus = order.status;
    order.status = OrderStatus.SHIPPED;
    if (details.trackingNumber) order.trackingNumber = details.trackingNumber;
    if (details.shipMethod) order.shipMethod = details.shipMethod;
    order.sentToCustomer = true;
    const saved = await this.orderRepo.save(order);

    // Logged so weekly reports can measure real shipping duration/on-time %
    // instead of falling back to order.updatedAt (which drifts if the order
    // is edited again after shipping).
    await this.eventRepo.save(this.eventRepo.create({
      orderId: id,
      userId: user?.id,
      userEmail: user?.email || 'system',
      action: 'STATUS_CHANGE',
      fromStatus,
      toStatus: OrderStatus.SHIPPED,
    }));

    if (order.customerId) {
      await this.notificationsService.create(
        NotificationType.ORDER_SHIPPED,
        'Your order has shipped!',
        `Order ${order.poNumber} has been dispatched${details.trackingNumber ? `. Tracking: ${details.trackingNumber}` : ''}.`,
        order.id,
        order.customerId,
        order.isPriorityCustomer,
      );
    }

    await this.notificationsService.create(
      NotificationType.ORDER_SHIPPED,
      `Order Shipped — ${order.poNumber}`,
      `Order ${order.poNumber} has been shipped${details.trackingNumber ? `. Tracking: ${details.trackingNumber}` : ''}.`,
      order.id,
      null,
      order.isPriorityCustomer,
    );

    return saved;
  }

  async getMetrics() {
    const manufactured = await this.orderRepo.count({ where: { status: OrderStatus.MANUFACTURED } });
    const shipped      = await this.orderRepo.count({ where: { status: OrderStatus.SHIPPED } });
    const completed    = await this.orderRepo.count({ where: { status: OrderStatus.COMPLETED } });
    return { manufactured, shipped, completed };
  }
}
