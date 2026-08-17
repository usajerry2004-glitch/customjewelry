import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { EmailService } from '../email/email.service';
import { OrdersService } from '../orders/orders.service';

export interface RingBuilderCustomerDto {
  firstName: string;
  lastName?: string;
  email: string;
  phoneNumber?: string;
  storeName?: string;
}

export interface RingBuilderItemDto {
  // The Ring Builder checkout's own line-item/order number — required, used
  // as the idempotency key so a retried submission never double-creates.
  externalOrderId: string;
  productName?: string;
  metalType?: string;
  metalColor?: string;
  size?: string;
  centerStoneShape?: string;
  approximateCaratWeight?: string;
  mountingOption?: string;
  quantity?: number;
  quotedCost?: number;
  referenceWeblink?: string;
  customerNotes?: string;
  // Any build spec without its own Order column (setting, coverage, band
  // width, basket height, fit, etc.) — appended into customerNotes as a
  // readable block so nothing from the configurator is lost.
  specs?: Record<string, string>;
}

export interface RingBuilderOrderDto {
  externalCartId?: string;
  customer: RingBuilderCustomerDto;
  items: RingBuilderItemDto[];
}

export interface RingBuilderOrderResult {
  success: boolean;
  externalCartId?: string;
  orders: {
    externalOrderId: string;
    poNumber: string;
    trackingToken: string;
    trackingUrl: string;
    status: OrderStatus;
  }[];
  message: string;
}

@Injectable()
export class RingBuilderOrdersService {
  private readonly logger = new Logger(RingBuilderOrdersService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(Order)        private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    private readonly emailService: EmailService,
    private readonly ordersService: OrdersService,
    config: ConfigService,
  ) {
    this.frontendUrl = (config.get('FRONTEND_URL', 'http://localhost:3000') as string).split(',')[0].trim();
  }

  private trackingUrl(token: string): string {
    return `${this.frontendUrl}/track/${token}`;
  }

  private buildCustomerNotes(item: RingBuilderItemDto): string | undefined {
    const specLines = Object.entries(item.specs || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${v}`);
    const parts = [item.customerNotes, ...specLines].filter(Boolean);
    return parts.length ? parts.join('\n') : undefined;
  }

  // ── Find or create customer by email (same pattern as the web-form intake) ──
  private async findOrCreateCustomer(dto: RingBuilderCustomerDto): Promise<User> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email })
      .getOne();
    if (existing) return existing;

    const passwordHash = await bcrypt.hash(`Kira@Ring${Date.now()}!`, 10);
    const user = this.userRepo.create({
      firstName: dto.firstName.trim(),
      lastName:  (dto.lastName || '—').trim(),
      email,
      passwordHash,
      role: UserRole.CUSTOMER,
      storeName: dto.storeName?.trim() || undefined,
      isActive: true,
    });
    return this.userRepo.save(user);
  }

  // ── Main: create one Order per cart line item ────────────────────────
  async createFromRingBuilder(dto: RingBuilderOrderDto): Promise<RingBuilderOrderResult> {
    if (!dto.customer?.email || !dto.customer?.firstName) {
      throw new BadRequestException('customer.email and customer.firstName are required');
    }
    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('items must be a non-empty array');
    }
    const missingRef = dto.items.find(i => !i.externalOrderId);
    if (missingRef) {
      throw new BadRequestException('Every item requires an externalOrderId');
    }

    const customer = await this.findOrCreateCustomer(dto.customer);
    const results: RingBuilderOrderResult['orders'] = [];
    const newlyCreated: Order[] = [];

    for (const item of dto.items) {
      // Idempotent: a retried submission for an item we already have returns
      // the existing order instead of creating a duplicate.
      const existing = await this.orderRepo.findOne({ where: { externalOrderId: item.externalOrderId } });
      if (existing) {
        results.push({
          externalOrderId: item.externalOrderId,
          poNumber:        existing.poNumber,
          trackingToken:   existing.trackingToken,
          trackingUrl:     this.trackingUrl(existing.trackingToken),
          status:          existing.status,
        });
        continue;
      }

      const poNumber      = await this.ordersService.generatePoNumber();
      const trackingToken = randomBytes(32).toString('hex');

      const order = await this.orderRepo.save(this.orderRepo.create({
        poNumber,
        trackingToken,
        status: OrderStatus.NEW,
        source: 'RING_BUILDER',
        externalOrderId: item.externalOrderId,
        externalCartId:  dto.externalCartId,
        customerId:       customer.id,
        customerEmail:    customer.email,
        customerFullName: `${dto.customer.firstName} ${dto.customer.lastName || ''}`.trim(),
        storeName:        dto.customer.storeName?.trim() || customer.storeName,
        phoneNumber:      dto.customer.phoneNumber,
        orderType:        item.productName || 'Ring Builder',
        size:             item.size,
        metalType:        item.metalType,
        metalColor:       item.metalColor,
        centerStoneShape: item.centerStoneShape,
        approximateCaratWeight: item.approximateCaratWeight,
        mountingOption:   item.mountingOption,
        quantity:         item.quantity || 1,
        quotedCost:       item.quotedCost,
        referenceWeblink: item.referenceWeblink,
        customerNotes:    this.buildCustomerNotes(item),
        salesRepName:     'Ring Builder',
        salesRepId:       customer.salesRepId || undefined,
      }));
      newlyCreated.push(order);
      results.push({
        externalOrderId: item.externalOrderId,
        poNumber:        order.poNumber,
        trackingToken:   order.trackingToken,
        trackingUrl:     this.trackingUrl(order.trackingToken),
        status:          order.status,
      });
    }

    if (newlyCreated.length) {
      await this.notifyAndEmail(customer, newlyCreated);
    }

    this.logger.log(`Ring Builder cart processed: ${newlyCreated.length} new order(s), ${results.length - newlyCreated.length} already existed`);
    return {
      success: true,
      externalCartId: dto.externalCartId,
      orders: results,
      message: `${results.length} order(s) received.`,
    };
  }

  private async notifyAndEmail(customer: User, orders: Order[]) {
    const staff = await this.userRepo.find({
      where: [{ role: UserRole.CAD_DESIGNER }, { role: UserRole.AUTHORIZER }],
    });
    const authEmails = staff.filter(u => u.role === UserRole.AUTHORIZER).map(u => u.email).filter(Boolean);

    for (const order of orders) {
      await Promise.all(staff.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.ORDER_CREATED,
          title: `New Ring Builder Order — ${order.poNumber}`,
          message: `${customer.storeName || customer.firstName + ' ' + customer.lastName} placed a Ring Builder order (${order.orderType}).`,
          orderId: order.id,
          targetUserId: u.id,
          isPriority: order.isPriorityCustomer,
        })),
      ));

      this.emailService.sendOrderPlaced({
        to:           customer.email,
        poNumber:     order.poNumber,
        customerName: order.customerFullName,
        orderType:    order.orderType || 'Ring Builder',
        orderId:      order.id,
        trackingToken: order.trackingToken,
      }).catch(err => this.logger.warn('Ring Builder order placed email failed:', err));

      if (authEmails.length) {
        this.emailService.sendNewOrderToAuthorizers({
          to:           authEmails,
          poNumber:     order.poNumber,
          customerName: order.customerFullName,
          orderType:    order.orderType || 'Ring Builder',
          storeName:    order.storeName || 'Ring Builder',
          orderId:      order.id,
          isPriorityCustomer: order.isPriorityCustomer,
        }).catch(err => this.logger.warn('Ring Builder new-order authorizer email failed:', err));
      }
    }
  }

  // ── Poll: only whether the order is done, nothing about internal stages ──
  // Deliberately narrow: the website should only ever learn "completed or
  // not" — none of NEW/CAD_IN_PROGRESS/VPO_ISSUED/MANUFACTURED/SHIPPED/etc.
  // are exposed here, since those are internal production stages, not
  // something the customer-facing site should reflect.
  async getOrderByExternalId(externalOrderId: string) {
    const order = await this.orderRepo.findOne({ where: { externalOrderId } });
    if (!order) throw new NotFoundException('Order not found');

    return {
      externalOrderId: order.externalOrderId,
      externalCartId:  order.externalCartId,
      poNumber:        order.poNumber,
      completed:       order.status === OrderStatus.COMPLETED,
      completedAt:     order.completedAt,
    };
  }
}
