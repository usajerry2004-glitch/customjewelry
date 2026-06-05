import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { EmailService } from '../email/email.service';

export class OrderFilterDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: OrderStatus;
  @IsOptional() @IsString() vendorName?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) offset?: number;
  @IsOptional() @IsNumber() @Min(1) @Type(() => Number) limit?: number;
}

// CAD designers only see CAD_IN_PROGRESS orders
const CAD_STATUSES = [OrderStatus.CAD_IN_PROGRESS];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)        private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    private readonly emailService: EmailService,
  ) {}

  // Send in-app notifications + optional Resend email to authorizers and CAD designers on revision
  private async notifyRevision(order: Order): Promise<void> {
    const targets = await this.userRepo.find({
      where: { role: In([UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.ADMIN]) },
    });

    const title = `CAD Revision Required — ${order.poNumber}`;
    const message = `Customer rejected the CAD design for order ${order.poNumber} (${order.storeName || order.customerFullName || ''}). The order has been moved to Revision stage. Please review and upload a revised design.`;

    // In-app notifications
    await Promise.all(
      targets.map(u =>
        this.notifRepo.save(
          this.notifRepo.create({
            type: NotificationType.CAD_REJECTED,
            title,
            message,
            orderId: order.id,
            targetUserId: u.id,
          }),
        ),
      ),
    );

    // Email via EmailService
    const emails = targets.map(u => u.email).filter(Boolean);
    if (emails.length) {
      await this.emailService.sendCadRevisionAlert({
        to: emails,
        poNumber: order.poNumber,
        customerName: order.customerFullName || order.storeName || '—',
        orderType: order.orderType || '—',
        orderId: order.id,
      });
    }
  }

  async findAll(filters: OrderFilterDto, user?: { id: string; email: string; role: string }) {
    const qb = this.orderRepo.createQueryBuilder('order');

    if (user?.role === 'CUSTOMER') {
      qb.andWhere(
        '(order.customerEmail = :email OR order.customerId = :uid)',
        { email: user.email, uid: user.id },
      );
    } else if (user?.role === 'SALES_REP') {
      qb.andWhere('order.salesRepId = :salesRepId', { salesRepId: user.id });
    } else if (user?.role === 'CAD_DESIGNER') {
      qb.andWhere('order.status IN (:...cadStatuses)', { cadStatuses: CAD_STATUSES });
    } else if (user?.role === 'SKU_MANAGER') {
      qb.andWhere('order.status IN (:...skuStatuses)', {
        skuStatuses: [OrderStatus.SKU_CREATION],
      });
    } else if (user?.role === 'FACTORY_MANAGER') {
      qb.andWhere('order.status IN (:...factoryStatuses)', {
        factoryStatuses: [OrderStatus.VPO_ISSUED, OrderStatus.PENDING_CONTRACTOR],
      });
    } else if (user?.role === 'SHIPPING_MANAGER') {
      qb.andWhere('order.status IN (:...shippingStatuses)', {
        shippingStatuses: [OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED, OrderStatus.DELIVERED],
      });
    } else if (user?.role === 'STONE_MANAGER') {
      qb.andWhere('order.status = :stoneStatus', { stoneStatus: OrderStatus.VPO_ISSUED });
    }

    if (filters.status) qb.andWhere('order.status = :status', { status: filters.status });
    if (filters.search) {
      qb.andWhere(
        '(order.poNumber LIKE :s OR order.storeName LIKE :s OR order.kiraSkuNumber LIKE :s)',
        { s: `%${filters.search}%` },
      );
    }
    if (filters.dateFrom) {
      qb.andWhere('order.createdAt >= :dateFrom', { dateFrom: new Date(filters.dateFrom) });
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      qb.andWhere('order.createdAt <= :dateTo', { dateTo: to });
    }
    qb.orderBy('order.isPriorityCustomer', 'DESC')
      .addOrderBy('order.createdAt', 'DESC')
      .skip(filters.offset || 0)
      .take(filters.limit || 50);
    const [orders, total] = await qb.getManyAndCount();
    return { orders, total };
  }

  async findOne(id: string, user?: { id?: string; email: string; role: string }): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    if (user?.role === 'CUSTOMER' && order.customerEmail !== user.email) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (user?.role === 'SALES_REP' && user.id && order.salesRepId !== user.id) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (user?.role === 'FACTORY_MANAGER' && !order.kiraSkuNumber) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    if (user?.role === 'SKU_MANAGER' && order.status !== OrderStatus.SKU_CREATION) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    const SHIPPING_STATUSES = [OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
    if (user?.role === 'SHIPPING_MANAGER' && !SHIPPING_STATUSES.includes(order.status)) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return order;
  }

  private async generatePoNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `KJ-${year}-`;
    // Find highest existing sequence for this year
    const latest = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.poNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('o.poNumber', 'DESC')
      .getOne();
    let seq = 1;
    if (latest) {
      const parts = latest.poNumber.split('-');
      const last = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(last)) seq = last + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async create(dto: Partial<Order>, user?: { id: string; email: string; firstName?: string; lastName?: string; role: string; [key: string]: any }): Promise<Order> {
    const data: Partial<Order> = { ...dto };

    // Always auto-generate PO number — ignore any client-supplied value
    data.poNumber = await this.generatePoNumber();

    // Store creator's full name from the JWT
    if (user) {
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
      if (fullName) data.salesRepName = fullName;
    }

    if (user?.role === 'CUSTOMER') {
      data.customerId = user.id;
      data.customerEmail = user.email;
      if (!data.customerFullName) {
        data.customerFullName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() || user.email;
      }
    } else if (user?.role === 'SALES_REP') {
      data.salesRepId = user.id;
      data.salesRepEmail = user.email;
      if (!data.customerId) {
        throw new BadRequestException('customerId is required. Orders must be placed for an existing customer.');
      }
    } else if (user?.role === 'AUTHORIZER') {
      if (!data.customerId) {
        throw new BadRequestException('customerId is required. Orders must be placed for an existing customer.');
      }
    }

    // Mark order with customer's priority status
    if (data.customerId) {
      const customer = await this.userRepo.findOne({ where: { id: data.customerId } });
      if (customer?.isPriority) data.isPriorityCustomer = true;
    }

    // Orders start directly in CAD_IN_PROGRESS — no authorization step needed
    if (!data.status) data.status = OrderStatus.CAD_IN_PROGRESS;

    const order = this.orderRepo.create(data);
    const saved = await this.orderRepo.save(order);

    // Email customer: order received
    const customerEmail = saved.customerEmail || (user?.role === 'CUSTOMER' ? user.email : null);
    if (customerEmail) {
      await this.emailService.sendOrderPlaced({
        to: customerEmail,
        poNumber: saved.poNumber,
        customerName: saved.customerFullName || saved.storeName || 'Valued Customer',
        orderType: saved.orderType || '—',
        orderId: saved.id,
      });
    }

    // Notify CAD designers: new order ready for CAD work
    const cadDesigners = await this.userRepo.find({ where: { role: In([UserRole.CAD_DESIGNER]) } });
    await Promise.all(cadDesigners.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type: NotificationType.ORDER_CREATED,
        title: `New Order — ${saved.poNumber}`,
        message: `A new order ${saved.poNumber} is ready for CAD design.`,
        orderId: saved.id,
        targetUserId: u.id,
      })),
    ));

    return saved;
  }

  async update(id: string, dto: Partial<Order>, user?: { id?: string; email: string; role: string }): Promise<Order> {
    const order = await this.findOne(id, user);
    Object.assign(order, dto);
    const saved = await this.orderRepo.save(order);

    // When quoted price is saved on a CAD-approved order → auto-move to SKU_CREATION
    if (dto.quotedCost && Number(dto.quotedCost) > 0
        && saved.status === OrderStatus.CAD_IN_PROGRESS
        && saved.customerEmailApproval === true) {
      saved.status = OrderStatus.SKU_CREATION;
      const skuOrder = await this.orderRepo.save(saved);
      if (skuOrder.customerEmail) {
        await this.emailService.sendOrderInProduction({
          to: skuOrder.customerEmail,
          poNumber: skuOrder.poNumber,
          customerName: skuOrder.customerFullName || skuOrder.storeName || 'Valued Customer',
          orderType: skuOrder.orderType || '—',
          quotedCost: Number(skuOrder.quotedCost),
          orderId: skuOrder.id,
        });
      }
      // Notify SKU team
      const skuUsers = await this.userRepo.find({ where: { role: In([UserRole.SKU_MANAGER]) } });
      await Promise.all(skuUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.STATUS_CHANGED,
          title: `SKU Creation — ${skuOrder.poNumber}`,
          message: `Order ${skuOrder.poNumber} is ready for SKU generation.`,
          orderId: skuOrder.id,
          targetUserId: u.id,
        })),
      ));
      return skuOrder;
    }

    return saved;
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    user?: { id?: string; email: string; role: string },
    quotedCost?: number,
  ): Promise<Order> {
    if (user?.role === 'CUSTOMER') {
      throw new ForbiddenException('Not authorized to change order status directly');
    }

    // Manual cancellation by admin/authorizer → deactivate
    if (status === OrderStatus.CANCELLED) {
      return this.update(id, { status: OrderStatus.CANCELLED, isArchived: true }, user);
    }

    // Require quoted price before moving to SKU Creation
    if (status === OrderStatus.SKU_CREATION) {
      const order = await this.findOne(id);
      const finalPrice = quotedCost ?? order.quotedCost;
      if (!finalPrice || Number(finalPrice) <= 0) {
        throw new BadRequestException('Approximate quoted price is required before moving to SKU Creation.');
      }
      const skuOrder = await this.update(id, { status, quotedCost: finalPrice }, user);
      // Email customer: design approved, in production
      if (skuOrder.customerEmail) {
        await this.emailService.sendOrderInProduction({
          to: skuOrder.customerEmail,
          poNumber: skuOrder.poNumber,
          customerName: skuOrder.customerFullName || skuOrder.storeName || 'Valued Customer',
          orderType: skuOrder.orderType || '—',
          quotedCost: skuOrder.quotedCost ? Number(skuOrder.quotedCost) : undefined,
          orderId: skuOrder.id,
        });
      }
      return skuOrder;
    }

    const patch: Partial<Order> = { status };
    if (quotedCost) patch.quotedCost = quotedCost;
    const updated = await this.update(id, patch, user);

    // READY_TO_SHIP — email customer + authorizers
    if (status === OrderStatus.READY_TO_SHIP) {
      if (updated.customerEmail) {
        await this.emailService.sendOrderReady({
          to: updated.customerEmail,
          poNumber: updated.poNumber,
          customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
          orderType: updated.orderType || '—',
          orderId: updated.id,
        });
      }
      // In-portal notification for authorizers (no email)
      const teamUsers = await this.userRepo.find({ where: { role: In([UserRole.AUTHORIZER, UserRole.ADMIN]) } });
      await Promise.all(teamUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.STATUS_CHANGED,
          title: `Ready to Ship — ${updated.poNumber}`,
          message: `Order ${updated.poNumber} is ready to ship.`,
          orderId: updated.id,
          targetUserId: u.id,
        })),
      ));
    }

    // SHIPPED — email customer + authorizers
    if (status === OrderStatus.SHIPPED) {
      if (updated.customerEmail) {
        await this.emailService.sendOrderShipped({
          to: updated.customerEmail,
          poNumber: updated.poNumber,
          customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
          orderType: updated.orderType || '—',
          trackingNumber: updated.trackingNumber,
          shipMethod: updated.shipMethod,
          orderId: updated.id,
        });
      }
      // In-portal notification for authorizers (no email)
      const teamUsers = await this.userRepo.find({ where: { role: In([UserRole.AUTHORIZER, UserRole.ADMIN]) } });
      await Promise.all(teamUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.ORDER_SHIPPED,
          title: `Order Shipped — ${updated.poNumber}`,
          message: `Order ${updated.poNumber} has been shipped${updated.trackingNumber ? ` (${updated.trackingNumber})` : ''}.`,
          orderId: updated.id,
          targetUserId: u.id,
        })),
      ));
    }

    // DELIVERED — email customer
    if (status === OrderStatus.DELIVERED && updated.customerEmail) {
      await this.emailService.sendOrderDelivered({
        to: updated.customerEmail,
        poNumber: updated.poNumber,
        customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
        orderType: updated.orderType || '—',
        orderId: updated.id,
      });
    }

    // COMPLETED — email customer
    if (status === OrderStatus.COMPLETED && updated.customerEmail) {
      await this.emailService.sendOrderDelivered({
        to: updated.customerEmail,
        poNumber: updated.poNumber,
        customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
        orderType: updated.orderType || '—',
        orderId: updated.id,
      });
    }

    return updated;
  }

  async authorize(id: string): Promise<Order> {
    const order = await this.findOne(id);
    if (order.status !== OrderStatus.WAITING_CONFIRMATION) {
      throw new ForbiddenException('Order must be in WAITING_CONFIRMATION status to authorize');
    }
    const updated = await this.orderRepo.save({ ...order, status: OrderStatus.PENDING_CAD });

    // Email customer: order confirmed
    if (updated.customerEmail) {
      await this.emailService.sendOrderConfirmedToCustomer({
        to: updated.customerEmail,
        poNumber: updated.poNumber,
        customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
        orderType: updated.orderType || '—',
        orderId: updated.id,
      });
    }

    // In-portal notification for CAD designers (no email for new job)
    const cadUsers = await this.userRepo.find({ where: { role: In([UserRole.CAD_DESIGNER, UserRole.ADMIN]) } });
    await Promise.all(cadUsers.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type: NotificationType.STATUS_CHANGED,
        title: `New CAD Job — ${updated.poNumber}`,
        message: `Order ${updated.poNumber} is ready for CAD design.`,
        orderId: updated.id,
        targetUserId: u.id,
      })),
    ));

    return updated;
  }

  async findPriority(user: { id: string; email: string; role: string }): Promise<any[]> {
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    const FINAL = [OrderStatus.COMPLETED, OrderStatus.DELIVERED, OrderStatus.CANCELLED];
    const results: any[] = [];

    // Role-specific SLA checks
    const role = user.role;

    // Base query scoped to what this role is responsible for
    const ROLE_STATUSES: Partial<Record<string, OrderStatus[]>> = {
      [UserRole.CAD_DESIGNER]:    [OrderStatus.PENDING_CAD, OrderStatus.CAD_IN_PROGRESS, OrderStatus.ORDER_REVISION],
      [UserRole.AUTHORIZER]:      [OrderStatus.WAITING_CONFIRMATION, OrderStatus.PENDING_CAD, OrderStatus.CAD_IN_PROGRESS, OrderStatus.CUSTOMER_APPROVED, OrderStatus.WAITING_FOR_PRICE],
      [UserRole.SKU_MANAGER]:     [OrderStatus.SKU_CREATION],
      [UserRole.FACTORY_MANAGER]: [OrderStatus.VPO_ISSUED, OrderStatus.PENDING_CONTRACTOR, OrderStatus.ORDER_JOB_BAG_CREATED, OrderStatus.READY_TO_INVOICE],
      [UserRole.SHIPPING_MANAGER]:[OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED, OrderStatus.DELIVERED],
    };

    const qb = () => {
      const q = this.orderRepo.createQueryBuilder('o').where('o.isArchived = false');
      const allowed = ROLE_STATUSES[role];
      if (allowed) q.andWhere('o.status IN (:...rs)', { rs: allowed });
      if (role === UserRole.SALES_REP && user.id) q.andWhere('o.salesRepId = :uid', { uid: user.id });
      return q;
    };

    // 0. ORDER_REVISION — always CRITICAL, highest priority
    const revisionOrders = await qb()
      .andWhere('o.status = :rev', { rev: OrderStatus.ORDER_REVISION })
      .getMany();
    revisionOrders.forEach(o => results.push({ ...o, priorityReason: 'Customer requested revision', priorityLevel: 'CRITICAL' }));

    // 1. Priority customer orders — scoped to role's status domain
    const priorityCustomers = await qb()
      .andWhere('o.isPriorityCustomer = true')
      .andWhere('o.status NOT IN (:...fin)', { fin: FINAL })
      .getMany();
    priorityCustomers.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'Priority Customer', priorityLevel: 'HIGH' });
    });

    // 2. Overall SLA: orders > 10 days old — scoped to role's status domain
    const overdue10 = await qb()
      .andWhere('o.status NOT IN (:...fin)', { fin: FINAL })
      .andWhere('o."createdAt" < :d', { d: daysAgo(10) })
      .getMany();
    overdue10.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'Order older than 10 days — not completed', priorityLevel: 'HIGH' });
    });

    if ([UserRole.CAD_DESIGNER, UserRole.ADMIN].includes(role as UserRole)) {
      // CAD: in CAD_IN_PROGRESS > 2 days with no file uploaded (cadSubStatus is null)
      const cadOverdue = await qb()
        .andWhere('o.status = :s', { s: OrderStatus.CAD_IN_PROGRESS })
        .andWhere('(o."cadSubStatus" IS NULL OR o."cadSubStatus" = :u)', { u: 'PENDING' })
        .andWhere('o."createdAt" < :d', { d: daysAgo(2) })
        .getMany();
      cadOverdue.forEach(o => {
        if (!results.find(r => r.id === o.id))
          results.push({ ...o, priorityReason: 'CAD file not uploaded — over 2 days', priorityLevel: 'MEDIUM' });
      });
    }

    if ([UserRole.AUTHORIZER, UserRole.ADMIN].includes(role as UserRole)) {
      // Authorizer: awaiting quote (cadSubStatus=APPROVED) > 2 days
      const quotePending = await qb()
        .andWhere('o.status = :s', { s: OrderStatus.CAD_IN_PROGRESS })
        .andWhere('o."cadSubStatus" = :cs', { cs: 'APPROVED' })
        .andWhere('o."updatedAt" < :d', { d: daysAgo(2) })
        .getMany();
      quotePending.forEach(o => {
        if (!results.find(r => r.id === o.id))
          results.push({ ...o, priorityReason: 'Quote price pending — over 2 days', priorityLevel: 'HIGH' });
      });
    }

    if ([UserRole.SKU_MANAGER, UserRole.ADMIN].includes(role as UserRole)) {
      // SKU: in SKU_CREATION > 1 day
      const skuOverdue = await qb()
        .andWhere('o.status = :s', { s: OrderStatus.SKU_CREATION })
        .andWhere('o."updatedAt" < :d', { d: daysAgo(1) })
        .getMany();
      skuOverdue.forEach(o => {
        if (!results.find(r => r.id === o.id))
          results.push({ ...o, priorityReason: 'SKU not generated — over 1 day', priorityLevel: 'MEDIUM' });
      });
    }

    if ([UserRole.FACTORY_MANAGER, UserRole.ADMIN].includes(role as UserRole)) {
      // Factory: in VPO_ISSUED > 4 days
      const factoryOverdue = await qb()
        .andWhere('o.status = :s', { s: OrderStatus.VPO_ISSUED })
        .andWhere('o."updatedAt" < :d', { d: daysAgo(4) })
        .getMany();
      factoryOverdue.forEach(o => {
        if (!results.find(r => r.id === o.id))
          results.push({ ...o, priorityReason: 'In VPO stage — over 4 days', priorityLevel: 'MEDIUM' });
      });
    }

    if ([UserRole.SHIPPING_MANAGER, UserRole.ADMIN].includes(role as UserRole)) {
      // Shipping: in READY_TO_SHIP > 1 day
      const shipOverdue = await qb()
        .andWhere('o.status = :s', { s: OrderStatus.READY_TO_SHIP })
        .andWhere('o."updatedAt" < :d', { d: daysAgo(1) })
        .getMany();
      shipOverdue.forEach(o => {
        if (!results.find(r => r.id === o.id))
          results.push({ ...o, priorityReason: 'Ready to ship — over 1 day', priorityLevel: 'MEDIUM' });
      });
    }

    const LEVEL_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
    return results.sort((a, b) => {
      const diff = (LEVEL_ORDER[a.priorityLevel] ?? 9) - (LEVEL_ORDER[b.priorityLevel] ?? 9);
      if (diff !== 0) return diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  async getForFactory() {
    return this.orderRepo.find({
      where: [
        { status: OrderStatus.SKU_CREATION },
        { status: OrderStatus.VPO_ISSUED },
        { status: OrderStatus.ORDER_JOB_BAG_CREATED },
      ],
      order: { updatedAt: 'ASC' },
    });
  }

  async getForShipping() {
    return this.orderRepo.find({
      where: { status: OrderStatus.READY_TO_SHIP },
      order: { updatedAt: 'ASC' },
    });
  }

  async getKanbanBoard(user?: { id: string; role: string }) {
    const statuses = Object.values(OrderStatus);
    return Promise.all(
      statuses.map(async (status) => {
        const qb = this.orderRepo.createQueryBuilder('o')
          .where('o.status = :status', { status })
          .andWhere('o.isArchived = false');

        if (user?.role === 'SALES_REP') {
          qb.andWhere('o.salesRepId = :salesRepId', { salesRepId: user.id });
        } else if (user?.role === 'CAD_DESIGNER') {
          if (!CAD_STATUSES.includes(status as OrderStatus)) {
            return { status, orders: [], count: 0 };
          }
        } else if (user?.role === 'FACTORY_MANAGER') {
          qb.andWhere('o.kiraSkuNumber IS NOT NULL');
        } else if (user?.role === 'SHIPPING_MANAGER') {
          if (![OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(status as OrderStatus)) {
            return { status, orders: [], count: 0 };
          }
        }

        const [orders, count] = await qb.orderBy('o.updatedAt', 'DESC').take(15).getManyAndCount();
        return { status, orders, count };
      }),
    );
  }

  async getMetrics() {
    const total = await this.orderRepo.count({ where: { isArchived: false } });
    const byStatus = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('o.isArchived = false')
      .groupBy('o.status')
      .getRawMany();
    const revenue = await this.orderRepo
      .createQueryBuilder('o')
      .select('SUM(o.quotedCost)', 'total')
      .where('o.status NOT IN (:...ex)', { ex: [OrderStatus.CANCELLED, OrderStatus.CUSTOMER_REJECTED] })
      .getRawOne();
    return { total, byStatus, totalRevenue: revenue?.total || 0 };
  }
}
