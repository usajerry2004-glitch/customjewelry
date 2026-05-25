import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';

@Injectable()
export class ShippingService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getReadyToShip() {
    return this.orderRepo.find({
      where: { status: OrderStatus.READY_TO_SHIP },
      order: { updatedAt: 'ASC' },
    });
  }

  async getShipped() {
    return this.orderRepo.find({
      where: [{ status: OrderStatus.SHIPPED }, { status: OrderStatus.DELIVERED }],
      order: { updatedAt: 'DESC' },
      take: 50,
    });
  }

  async dispatch(id: string, details: { trackingNumber: string; shipMethod?: string }) {
    if (!details.trackingNumber) {
      throw new BadRequestException('Tracking number is required');
    }
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.READY_TO_SHIP) {
      throw new BadRequestException('Order must be in READY_TO_SHIP status to dispatch');
    }
    order.status = OrderStatus.SHIPPED;
    order.trackingNumber = details.trackingNumber;
    if (details.shipMethod) order.shipMethod = details.shipMethod;
    order.sentToCustomer = true;
    const saved = await this.orderRepo.save(order);

    // Notify customer
    if (order.customerId) {
      await this.notificationsService.create(
        NotificationType.ORDER_SHIPPED,
        'Your order has shipped!',
        `Order ${order.poNumber} has been dispatched. Tracking: ${details.trackingNumber}.`,
        order.id,
        order.customerId,
      );
    }

    // Notify authorizer
    await this.notificationsService.create(
      NotificationType.ORDER_SHIPPED,
      'Order shipped',
      `Order ${order.poNumber} has been shipped. Tracking: ${details.trackingNumber}.`,
      order.id,
      null,
    );

    return saved;
  }

  async markDelivered(id: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (order.status !== OrderStatus.SHIPPED) {
      throw new BadRequestException('Order must be in SHIPPED status to mark as delivered');
    }
    order.status = OrderStatus.DELIVERED;
    const saved = await this.orderRepo.save(order);

    if (order.customerId) {
      await this.notificationsService.create(
        NotificationType.ORDER_SHIPPED,
        'Order delivered!',
        `Your order ${order.poNumber} has been delivered. Thank you for choosing Kira Jewels!`,
        order.id,
        order.customerId,
      );
    }

    return saved;
  }

  async getMetrics() {
    const readyToShip = await this.orderRepo.count({ where: { status: OrderStatus.READY_TO_SHIP } });
    const shipped = await this.orderRepo.count({ where: { status: OrderStatus.SHIPPED } });
    const delivered = await this.orderRepo.count({ where: { status: OrderStatus.DELIVERED } });
    return { readyToShip, shipped, delivered };
  }
}
