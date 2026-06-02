import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Order, OrderStatus } from '../../database/entities/order.entity';

export class OrderFilterDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: OrderStatus;
  @IsOptional() @IsString() vendorName?: string;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) offset?: number;
  @IsOptional() @IsNumber() @Min(1) @Type(() => Number) limit?: number;
}

const CAD_STATUSES = [
  OrderStatus.PENDING_CAD,
  OrderStatus.CAD_IN_PROGRESS,
  OrderStatus.CUSTOMER_APPROVED,
  OrderStatus.CUSTOMER_REJECTED,
];

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

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
        skuStatuses: [OrderStatus.CUSTOMER_APPROVED, OrderStatus.SKU_CREATION],
      });
    } else if (user?.role === 'FACTORY_MANAGER') {
      qb.andWhere('order.kiraSkuNumber IS NOT NULL');
    } else if (user?.role === 'SHIPPING_MANAGER') {
      qb.andWhere('order.status IN (:...shippingStatuses)', {
        shippingStatuses: [OrderStatus.READY_TO_SHIP, OrderStatus.SHIPPED, OrderStatus.DELIVERED],
      });
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
    qb.orderBy('order.createdAt', 'DESC')
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

    const order = this.orderRepo.create(data);
    return this.orderRepo.save(order);
  }

  async update(id: string, dto: Partial<Order>, user?: { id?: string; email: string; role: string }): Promise<Order> {
    const order = await this.findOne(id, user);
    Object.assign(order, dto);
    return this.orderRepo.save(order);
  }

  async updateStatus(id: string, status: OrderStatus, user?: { id?: string; email: string; role: string }): Promise<Order> {
    if (user?.role === 'CUSTOMER') {
      throw new ForbiddenException('Not authorized to change order status directly');
    }
    if (user?.role === 'CAD_DESIGNER') {
      const order = await this.findOne(id);
      if (order.status !== OrderStatus.PENDING_CAD || status !== OrderStatus.CAD_IN_PROGRESS) {
        throw new ForbiddenException('CAD Designer can only move orders from Pending CAD to CAD In Progress');
      }
    }
    return this.update(id, { status }, user);
  }

  async authorize(id: string): Promise<Order> {
    const order = await this.findOne(id);
    if (order.status !== OrderStatus.WAITING_CONFIRMATION) {
      throw new ForbiddenException('Order must be in WAITING_CONFIRMATION status to authorize');
    }
    return this.orderRepo.save({ ...order, status: OrderStatus.PENDING_CAD });
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
