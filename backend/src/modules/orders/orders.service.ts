import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { randomBytes } from 'crypto';
import { Order, OrderStatus, StoneStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { Sku } from '../../database/entities/sku.entity';
import { EmailService } from '../email/email.service';
import { OrderFilterDto } from './dto/order-filter.dto';
import { SkuService } from '../sku/sku.service';

export { OrderFilterDto };

const CAD_STATUSES = [OrderStatus.NEW, OrderStatus.CAD_IN_PROGRESS];

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.NEW]:             [OrderStatus.CAD_IN_PROGRESS],
  [OrderStatus.CAD_IN_PROGRESS]: [OrderStatus.VPO_ISSUED],
  [OrderStatus.VPO_ISSUED]:      [OrderStatus.MANUFACTURED],
  [OrderStatus.MANUFACTURED]:    [OrderStatus.COMPLETED, OrderStatus.REPAIR],
  [OrderStatus.REPAIR]:          [OrderStatus.COMPLETED],
  [OrderStatus.SHIPPED]:         [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]:       [],
  [OrderStatus.CANCELLED]:       [],
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)        private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    @InjectRepository(CadFile)      private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(OrderEvent)   private readonly eventRepo: Repository<OrderEvent>,
    @InjectRepository(OrderMessage) private readonly messageRepo: Repository<OrderMessage>,
    @InjectRepository(Sku)          private readonly skuRepo: Repository<Sku>,
    private readonly emailService: EmailService,
    private readonly skuService: SkuService,
  ) {}

  private logEvent(
    orderId: string,
    action: string,
    user?: { id?: string; email: string },
    fromStatus?: string,
    toStatus?: string,
    note?: string,
  ) {
    const ev = this.eventRepo.create({
      orderId,
      userId: user?.id,
      userEmail: user?.email || 'system',
      action,
      fromStatus,
      toStatus,
      note,
    });
    this.eventRepo.save(ev).catch(() => {});
  }

  async getEvents(orderId: string): Promise<OrderEvent[]> {
    return this.eventRepo.find({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  // Permanently deletes an order and every row that hangs off its orderId.
  // No FK cascade exists at the DB level, so child tables are cleared explicitly.
  async remove(id: string, user?: { email: string }): Promise<{ deleted: true; poNumber: string }> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    await this.cadRepo.delete({ orderId: id });
    await this.skuRepo.delete({ orderId: id });
    await this.notifRepo.delete({ orderId: id });
    await this.messageRepo.delete({ orderId: id });
    await this.eventRepo.delete({ orderId: id });
    await this.orderRepo.delete(id);

    this.logger.warn(`Order ${order.poNumber} (${id}) permanently deleted by ${user?.email || 'unknown'}`);
    return { deleted: true, poNumber: order.poNumber };
  }

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
      this.emailService.sendCadRevisionAlert({
        to: emails,
        poNumber: order.poNumber,
        customerName: order.customerFullName || order.storeName || '—',
        orderType: order.orderType || '—',
        orderId: order.id,
      }).catch(err => this.logger.warn('CAD revision email failed:', err));
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
    } else if (user?.role === 'FACTORY_MANAGER') {
      qb.andWhere('order.status IN (:...factoryStatuses)', {
        factoryStatuses: [OrderStatus.VPO_ISSUED, OrderStatus.MANUFACTURED],
      });
    } else if (user?.role === 'STONE_MANAGER') {
      qb.andWhere('order.status = :vpoStatus', { vpoStatus: OrderStatus.VPO_ISSUED });
      qb.andWhere('(order.stoneStatus = :pendingStone OR order.stoneStatus IS NULL)', { pendingStone: 'PENDING_STONE' });
    }

    if (filters.status) qb.andWhere('order.status = :status', { status: filters.status });

    // CAD sub-filters (applied server-side so pagination is accurate)
    if (filters.cadSubFilter === 'cad_pending')
      qb.andWhere('(order.cadSubStatus IS NULL OR order.cadSubStatus = :csPending)', { csPending: 'PENDING' });
    else if (filters.cadSubFilter === 'cad_awaiting_quote')
      qb.andWhere('(order.cadSubStatus = :csUploaded AND order.sentToCustomer = :notSent)', { csUploaded: 'UPLOADED', notSent: false });
    else if (filters.cadSubFilter === 'cad_awaiting_approval')
      qb.andWhere('(order.cadSubStatus = :csUploaded2 AND order.sentToCustomer = :sent)', { csUploaded2: 'UPLOADED', sent: true });
    else if (filters.cadSubFilter === 'cad_revision')
      qb.andWhere('order.cadSubStatus = :csRevision', { csRevision: 'REVISION' });
    else if (filters.cadSubFilter === 'cad_approved')
      qb.andWhere('order.cadSubStatus = :csApproved', { csApproved: 'APPROVED' });

    // Stone sub-filters
    if (filters.stoneSubFilter === 'stone_pending')
      qb.andWhere('(order.stoneStatus IS NULL OR order.stoneStatus = :spPending)', { spPending: 'PENDING_STONE' });
    else if (filters.stoneSubFilter === 'stone_received')
      qb.andWhere('order.stoneStatus = :spReceived', { spReceived: 'STONE_RECEIVED' });

    if (filters.search) {
      const escaped = filters.search.replace(/[%_\\]/g, c => `\\${c}`);
      qb.andWhere(
        '(order.poNumber LIKE :s OR order.storeName LIKE :s OR order.kiraSkuNumber LIKE :s OR order.customerFullName LIKE :s OR order.customerEmail LIKE :s)',
        { s: `%${escaped}%` },
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

    if (user?.role === 'FACTORY_MANAGER' &&
        order.status !== OrderStatus.VPO_ISSUED &&
        order.status !== OrderStatus.MANUFACTURED) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return order;
  }

  // New style: "C00001", "C00002", ... Legacy "CO#####" orders (and the
  // embedded "KJ-2026-XXXX (CO#####)" format) are a separate, frozen
  // sequence — this only continues the highest existing "C#####" number.
  // Public so other order-creation entry points (e.g. the public web-form
  // intake) share the same sequence instead of keeping their own.
  async generatePoNumber(): Promise<string> {
    const [{ maxSeq }]: { maxSeq: number | null }[] = await this.orderRepo.query(
      `SELECT MAX(CAST(SUBSTRING("poNumber" FROM 2) AS INTEGER)) AS "maxSeq" FROM orders WHERE "poNumber" ~ '^C[0-9]+$'`,
    );
    return `C${String((maxSeq ?? 0) + 1).padStart(5, '0')}`;
  }

  async create(dto: Partial<Order>, user?: { id: string; email: string; firstName?: string; lastName?: string; role: string; [key: string]: any }): Promise<Order> {
    const data: Partial<Order> = { ...dto };

    // Always auto-generate PO number and tracking token — ignore any client-supplied values
    data.poNumber      = await this.generatePoNumber();
    data.trackingToken = randomBytes(32).toString('hex');

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

    // New orders start in NEW status — auth/admin reviews and moves to CAD_IN_PROGRESS
    if (!data.status) data.status = OrderStatus.NEW;

    const order = this.orderRepo.create(data);
    const saved = await this.orderRepo.save(order);

    // Email customer: order received (with magic tracking link)
    const customerEmail = saved.customerEmail || (user?.role === 'CUSTOMER' ? user.email : null);
    if (customerEmail) {
      this.emailService.sendOrderPlaced({
        to:             customerEmail,
        poNumber:       saved.poNumber,
        customerName:   saved.customerFullName || saved.storeName || 'Valued Customer',
        orderType:      saved.orderType || '—',
        orderId:        saved.id,
        trackingToken:  saved.trackingToken,
      }).catch(err => this.logger.warn('Order placed email failed:', err));
    }

    // Notify authorizers/admins: new order received — they review before assigning CAD
    const authTeam = await this.userRepo.find({ where: { role: In([UserRole.ADMIN, UserRole.AUTHORIZER]) } });
    const authEmails = authTeam.map(u => u.email).filter(Boolean);
    await Promise.all(authTeam.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type: NotificationType.ORDER_CREATED,
        title: `New Order Received — ${saved.poNumber}`,
        message: `A new order ${saved.poNumber} has been placed and is awaiting your review.`,
        orderId: saved.id,
        targetUserId: u.id,
      })),
    ));
    if (authEmails.length) {
      this.emailService.sendNewOrderToAuthorizers({
        to: authEmails,
        poNumber: saved.poNumber,
        customerName: saved.customerFullName || saved.storeName || 'Valued Customer',
        orderType: saved.orderType || '—',
        storeName: saved.storeName || '',
        orderId: saved.id,
      }).catch(err => this.logger.warn('New order authorizer email failed:', err));
    }

    return saved;
  }

  async update(id: string, dto: Partial<Order>, user?: { id?: string; email: string; role: string }): Promise<Order> {
    const order = await this.findOne(id, user);
    Object.assign(order, dto);
    const saved = await this.orderRepo.save(order);

    // When quoted price is saved on CAD_IN_PROGRESS order (not yet sent/approved) → auto-send to customer
    if (dto.quotedCost && Number(dto.quotedCost) > 0
        && saved.status === OrderStatus.CAD_IN_PROGRESS
        && saved.customerEmailApproval !== true
        && !saved.sentToCustomer) {
      const allCads = await this.cadRepo.find({ where: { orderId: id } });
      const uploadedDesignFiles = allCads.filter(
        c => c.designerNotes !== 'Reference image' && c.designerNotes !== 'Customer reference image'
          && (c.status === CadFileStatus.UPLOADED || c.status === CadFileStatus.SENT_FOR_APPROVAL),
      );
      if (uploadedDesignFiles.length > 0) {
        await this.orderRepo.update(id, { sentToCustomer: true });
        // Only UPLOADED ones need a status bump; SENT_FOR_APPROVAL already correct
        const toBumpIds = uploadedDesignFiles.filter(c => c.status === CadFileStatus.UPLOADED).map(c => c.id);
        if (toBumpIds.length) {
          await this.cadRepo.update({ id: In(toBumpIds) }, { status: CadFileStatus.SENT_FOR_APPROVAL });
        }
        if (saved.customerEmail) {
          this.emailService.sendCadReadyForApproval({
            to:            saved.customerEmail,
            poNumber:      saved.poNumber,
            customerName:  saved.customerFullName || saved.storeName || 'Valued Customer',
            orderType:     saved.orderType || '—',
            orderId:       saved.id,
            trackingToken: saved.trackingToken,
          }).catch(err => this.logger.warn('CAD ready for approval email failed:', err));
        }
      }
    }

    return saved;
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    user?: { id?: string; email: string; role: string },
    quotedCost?: number,
    repairContractor?: string,
  ): Promise<Order> {
    if (user?.role === 'CUSTOMER') {
      throw new ForbiddenException('Not authorized to change order status directly');
    }

    // Manual cancellation by admin/authorizer → deactivate (allowed from any active status)
    if (status === OrderStatus.CANCELLED) {
      return this.update(id, { status: OrderStatus.CANCELLED, isArchived: true }, user);
    }

    // ── Status transition guard — prevent stage-skipping ─────────────────
    const existing = await this.findOne(id);
    const allowed = ALLOWED_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ${status}. ` +
        `Allowed next steps: ${allowed?.length ? allowed.join(', ') : 'none (order is in a terminal state)'}`,
      );
    }

    // Require quoted price, auto-generate the SKU, and issue the VPO in one step
    if (status === OrderStatus.VPO_ISSUED) {
      const order = await this.findOne(id);
      const finalPrice = quotedCost ?? order.quotedCost;
      if (!finalPrice || Number(finalPrice) <= 0) {
        throw new BadRequestException('Approximate quoted price is required before issuing the VPO.');
      }
      if (!order.kiraSkuNumber) {
        await this.skuService.generate(id, user?.email);
      }
      const vpoOrder = await this.update(id, { status, quotedCost: finalPrice }, user);
      this.logEvent(id, 'STATUS_CHANGE', user, existing.status, status);

      // Email customer: design approved, in production
      if (vpoOrder.customerEmail) {
        this.emailService.sendOrderInProduction({
          to: vpoOrder.customerEmail,
          poNumber: vpoOrder.poNumber,
          customerName: vpoOrder.customerFullName || vpoOrder.storeName || 'Valued Customer',
          orderType: vpoOrder.orderType || '—',
          quotedCost: vpoOrder.quotedCost ? Number(vpoOrder.quotedCost) : undefined,
          orderId: vpoOrder.id,
        }).catch(err => this.logger.warn('Order in production email failed:', err));
      }

      // Notify Factory Manager and Stone Manager simultaneously
      const vpoUsers = await this.userRepo.find({
        where: { role: In([UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER, UserRole.ADMIN]) },
      });
      await Promise.all(vpoUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.STATUS_CHANGED,
          title: `VPO Issued — ${vpoOrder.poNumber}`,
          message: u.role === UserRole.STONE_MANAGER
            ? `Order ${vpoOrder.poNumber} is ready — please arrange stones.`
            : `Order ${vpoOrder.poNumber} has been issued to the factory for manufacturing.`,
          orderId: vpoOrder.id,
          targetUserId: u.id,
        })),
      ));

      return vpoOrder;
    }

    // Require contractor name when moving to REPAIR
    if (status === OrderStatus.REPAIR) {
      if (!repairContractor || !repairContractor.trim()) {
        throw new BadRequestException('Contractor name is required when sending an order for repair');
      }
      return this.update(id, { status: OrderStatus.REPAIR, repairContractor: repairContractor.trim() }, user);
    }

    // Factory Manager: moving VPO_ISSUED → MANUFACTURED requires stone received
    if (user?.role === 'FACTORY_MANAGER' && status === OrderStatus.MANUFACTURED) {
      const currentOrder = await this.findOne(id);
      if (currentOrder.stoneStatus !== StoneStatus.STONE_RECEIVED) {
        throw new BadRequestException('Stone must be received before marking order as manufactured');
      }
    }

    const patch: Partial<Order> = { status };
    if (quotedCost) patch.quotedCost = quotedCost;
    const updated = await this.update(id, patch, user);
    this.logEvent(id, 'STATUS_CHANGE', user, existing.status, status);

    // NEW → CAD_IN_PROGRESS: notify CAD designers
    if (status === OrderStatus.CAD_IN_PROGRESS) {
      const cadUsers = await this.userRepo.find({ where: { role: In([UserRole.CAD_DESIGNER, UserRole.ADMIN]) } });
      const cadEmails = cadUsers.filter(u => u.role === UserRole.CAD_DESIGNER).map(u => u.email).filter(Boolean);
      await Promise.all(cadUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.ORDER_CREATED,
          title: `New CAD Job — ${updated.poNumber}`,
          message: `Order ${updated.poNumber} is ready for CAD design.`,
          orderId: updated.id,
          targetUserId: u.id,
        })),
      ));
      if (cadEmails.length) {
        this.emailService.sendPendingCadToDesigners({
          to: cadEmails,
          poNumber: updated.poNumber,
          customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
          orderType: updated.orderType || '—',
          orderId: updated.id,
        }).catch(err => this.logger.warn('Pending CAD designer email failed:', err));
      }
      if (updated.customerEmail) {
        this.emailService.sendOrderConfirmedToCustomer({
          to:           updated.customerEmail,
          poNumber:     updated.poNumber,
          customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
          orderType:    updated.orderType || '—',
          orderId:      updated.id,
        }).catch(err => this.logger.warn('Order confirmed customer email failed:', err));
      }
    }

    // MANUFACTURED — notify authorizers/admins (US team to receive)
    if (status === OrderStatus.MANUFACTURED) {
      const teamUsers = await this.userRepo.find({ where: { role: In([UserRole.AUTHORIZER, UserRole.ADMIN]) } });
      await Promise.all(teamUsers.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.STATUS_CHANGED,
          title: `Manufactured — ${updated.poNumber}`,
          message: `Order ${updated.poNumber} has been manufactured and is en route to the US office.`,
          orderId: updated.id,
          targetUserId: u.id,
        })),
      ));
    }

    // SHIPPED — email customer + authorizers
    if (status === OrderStatus.SHIPPED) {
      if (updated.customerEmail) {
        this.emailService.sendOrderShipped({
          to: updated.customerEmail,
          poNumber: updated.poNumber,
          customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
          orderType: updated.orderType || '—',
          trackingNumber: updated.trackingNumber,
          shipMethod: updated.shipMethod,
          orderId: updated.id,
        }).catch(err => this.logger.warn('Order shipped email failed:', err));
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

    // COMPLETED — email customer
    if (status === OrderStatus.COMPLETED && updated.customerEmail) {
      this.emailService.sendOrderDelivered({
        to: updated.customerEmail,
        poNumber: updated.poNumber,
        customerName: updated.customerFullName || updated.storeName || 'Valued Customer',
        orderType: updated.orderType || '—',
        orderId: updated.id,
      }).catch(err => this.logger.warn('Order delivered email failed:', err));
    }

    return updated;
  }

  async authorize(id: string): Promise<Order> {
    // Kept for API compatibility — orders now start at CAD_IN_PROGRESS directly.
    // This notifies CAD designers that a new order is ready.
    const order = await this.findOne(id);
    const cadUsers = await this.userRepo.find({ where: { role: In([UserRole.CAD_DESIGNER, UserRole.ADMIN]) } });
    await Promise.all(cadUsers.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type: NotificationType.STATUS_CHANGED,
        title: `New CAD Job — ${order.poNumber}`,
        message: `Order ${order.poNumber} is ready for CAD design.`,
        orderId: order.id,
        targetUserId: u.id,
      })),
    ));
    return order;
  }

  async findPriority(user: { id: string; email: string; role: string }): Promise<any[]> {
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    const FINAL = [OrderStatus.COMPLETED, OrderStatus.CANCELLED];
    const results: any[] = [];

    // Role-specific SLA checks
    const role = user.role;

    // Base query scoped to what this role is responsible for
    const ROLE_STATUSES: Partial<Record<string, OrderStatus[]>> = {
      [UserRole.CAD_DESIGNER]:    [OrderStatus.CAD_IN_PROGRESS],
      [UserRole.AUTHORIZER]:      [OrderStatus.NEW, OrderStatus.CAD_IN_PROGRESS, OrderStatus.VPO_ISSUED, OrderStatus.MANUFACTURED, OrderStatus.SHIPPED],
      [UserRole.FACTORY_MANAGER]: [OrderStatus.VPO_ISSUED],
      [UserRole.STONE_MANAGER]:   [OrderStatus.VPO_ISSUED],
    };

    const qb = () => {
      const q = this.orderRepo.createQueryBuilder('o').where('o.isArchived = false');
      const allowed = ROLE_STATUSES[role];
      if (allowed) q.andWhere('o.status IN (:...rs)', { rs: allowed });
      if (role === UserRole.SALES_REP && user.id) q.andWhere('o.salesRepId = :uid', { uid: user.id });
      return q;
    };

    // Fire every role-relevant query concurrently instead of one-at-a-time —
    // each round trip to the DB was adding its own latency in series.
    const none = Promise.resolve([] as Order[]);
    const [
      revisionOrders,
      priorityCustomers,
      stoneOverdue,
      overdue10,
      cadOverdue,
      quotePending,
      factoryOverdue,
      repairOverdue,
    ] = await Promise.all([
      // 0. CAD revision requested — always CRITICAL
      qb()
        .andWhere('o.status = :s', { s: OrderStatus.CAD_IN_PROGRESS })
        .andWhere('o."cadSubStatus" = :r', { r: 'REVISION' })
        .getMany(),
      // 1. Priority customer orders — scoped to role's status domain
      qb()
        .andWhere('o.isPriorityCustomer = true')
        .andWhere('o.status NOT IN (:...fin)', { fin: FINAL })
        .getMany(),
      // Stone Manager: stone pending > 1 day — run FIRST so it wins over generic overdue
      [UserRole.STONE_MANAGER, UserRole.ADMIN].includes(role as UserRole)
        ? this.orderRepo.createQueryBuilder('o')
            .where('o.isArchived = false')
            .andWhere('o.status = :s', { s: OrderStatus.VPO_ISSUED })
            .andWhere('(o.stoneStatus = :pending OR o.stoneStatus IS NULL)', { pending: StoneStatus.PENDING_STONE })
            .andWhere('o."updatedAt" < :d', { d: daysAgo(1) })
            .getMany()
        : none,
      // 2. Overall SLA: orders > 10 days old — skip Stone Manager (they only care about stone status)
      role !== UserRole.STONE_MANAGER
        ? qb()
            .andWhere('o.status NOT IN (:...fin)', { fin: FINAL })
            .andWhere('o."createdAt" < :d', { d: daysAgo(10) })
            .getMany()
        : none,
      // CAD: in CAD_IN_PROGRESS > 1 day with no file uploaded
      [UserRole.CAD_DESIGNER, UserRole.ADMIN].includes(role as UserRole)
        ? qb()
            .andWhere('o.status = :s', { s: OrderStatus.CAD_IN_PROGRESS })
            .andWhere('(o."cadSubStatus" IS NULL OR o."cadSubStatus" = :u)', { u: 'PENDING' })
            .andWhere('o."updatedAt" < :d', { d: daysAgo(1) })
            .getMany()
        : none,
      // Authorizer: awaiting quote price (cadSubStatus=APPROVED) > 1 day
      [UserRole.AUTHORIZER, UserRole.ADMIN].includes(role as UserRole)
        ? qb()
            .andWhere('o.status = :s', { s: OrderStatus.CAD_IN_PROGRESS })
            .andWhere('o."cadSubStatus" = :cs', { cs: 'APPROVED' })
            .andWhere('o."updatedAt" < :d', { d: daysAgo(1) })
            .getMany()
        : none,
      // Factory: in VPO_ISSUED > 4 days
      [UserRole.FACTORY_MANAGER, UserRole.ADMIN].includes(role as UserRole)
        ? qb()
            .andWhere('o.status = :s', { s: OrderStatus.VPO_ISSUED })
            .andWhere('o."updatedAt" < :d', { d: daysAgo(4) })
            .getMany()
        : none,
      // Repair: in REPAIR > 1 day — needs follow-up
      [UserRole.AUTHORIZER, UserRole.ADMIN].includes(role as UserRole)
        ? this.orderRepo.createQueryBuilder('o')
            .where('o.isArchived = false')
            .andWhere('o.status = :s', { s: OrderStatus.REPAIR })
            .andWhere('o."updatedAt" < :d', { d: daysAgo(1) })
            .getMany()
        : none,
    ]);

    // Same precedence as before: earlier blocks win when an order matches more than one rule.
    revisionOrders.forEach(o => results.push({ ...o, priorityReason: 'Customer requested CAD revision', priorityLevel: 'CRITICAL' }));
    priorityCustomers.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'Priority Customer', priorityLevel: 'HIGH' });
    });
    stoneOverdue.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'Stone pending — over 1 day since VPO issued', priorityLevel: 'HIGH' });
    });
    overdue10.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'Order older than 10 days — not completed', priorityLevel: 'HIGH' });
    });
    cadOverdue.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'CAD file not uploaded — over 1 day', priorityLevel: 'HIGH' });
    });
    quotePending.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'Quote price pending — over 1 day', priorityLevel: 'HIGH' });
    });
    factoryOverdue.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: 'In VPO stage — over 4 days', priorityLevel: 'MEDIUM' });
    });
    repairOverdue.forEach(o => {
      if (!results.find(r => r.id === o.id))
        results.push({ ...o, priorityReason: `With repair contractor${o.repairContractor ? ` (${o.repairContractor})` : ''} — over 1 day`, priorityLevel: 'HIGH' });
    });


    const LEVEL_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
    return results.sort((a, b) => {
      const diff = (LEVEL_ORDER[a.priorityLevel] ?? 9) - (LEVEL_ORDER[b.priorityLevel] ?? 9);
      if (diff !== 0) return diff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  async getForFactory() {
    return this.orderRepo.find({
      where: { status: OrderStatus.VPO_ISSUED },
      order: { updatedAt: 'ASC' },
    });
  }

  async getKanbanBoard(user?: { id: string; role: string }) {
    const statuses = Object.values(OrderStatus);

    const buildBase = () => {
      const q = this.orderRepo.createQueryBuilder('o').where('o.isArchived = false');
      if (user?.role === 'SALES_REP') {
        q.andWhere('o.salesRepId = :salesRepId', { salesRepId: user.id });
      } else if (user?.role === 'CAD_DESIGNER') {
        q.andWhere('o.status IN (:...cadStatuses)', { cadStatuses: CAD_STATUSES });
      } else if (user?.role === 'FACTORY_MANAGER') {
        q.andWhere('o.kiraSkuNumber IS NOT NULL');
      }
      return q;
    };

    // One query for the rows (most-recent-first, capped) + one lightweight
    // grouped count — replaces the previous 8 separate per-status queries.
    // Row query only selects what the Kanban card actually renders, instead
    // of the full entity (customer notes, financial fields the card doesn't
    // show, etc.) — the payload shrinks accordingly as order volume grows.
    const [allOrders, rawCounts] = await Promise.all([
      buildBase()
        .select([
          'o.id', 'o.poNumber', 'o.kiraSkuNumber', 'o.status', 'o.cadSubStatus',
          'o.sentToCustomer', 'o.stoneStatus', 'o.isPriorityCustomer', 'o.quotedCost',
          'o.orderType', 'o.metalType', 'o.metalColor', 'o.salesRepName', 'o.salesRepEmail',
          'o.storeName', 'o.customerFullName', 'o.createdAt', 'o.updatedAt',
        ])
        .orderBy('o.updatedAt', 'DESC').take(3000).getMany(),
      buildBase().select('o.status', 'status').addSelect('COUNT(*)', 'count').groupBy('o.status').getRawMany(),
    ]);

    const countByStatus = new Map<string, number>(rawCounts.map((r: any) => [r.status, parseInt(r.count, 10)]));
    const ordersByStatus = new Map<string, Order[]>();
    for (const o of allOrders) {
      const list = ordersByStatus.get(o.status) || [];
      list.push(o);
      ordersByStatus.set(o.status, list);
    }

    return statuses.map(status => ({
      status,
      orders: (ordersByStatus.get(status) || []).slice(0, 500),
      count: countByStatus.get(status) || 0,
    }));
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
      .where('o.status NOT IN (:...ex)', { ex: [OrderStatus.CANCELLED] })
      .getRawOne();
    return { total, byStatus, totalRevenue: revenue?.total || 0 };
  }
}
