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

    return order;
  }

  async create(dto: Partial<Order>, user?: { id: string; email: string; firstName?: string; lastName?: string; role: string }): Promise<Order> {
    const data: Partial<Order> = { ...dto };

    if (user?.role === 'CUSTOMER') {
      // Customers get auto-assigned identity and PO number
      data.customerId = user.id;
      data.customerEmail = user.email;
      if (!data.customerFullName) {
        data.customerFullName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() || user.email;
      }
      if (!data.poNumber) {
        const count = await this.orderRepo.count();
        data.poNumber = `KJ-CUST-${String(count + 1).padStart(4, '0')}`;
      }
    } else if (user?.role === 'SALES_REP') {
      // Sales reps get assigned as the order creator
      data.salesRepId = user.id;
      data.salesRepEmail = user.email;
      if (!data.poNumber) {
        throw new BadRequestException('poNumber is required when creating an order as staff. Provide a unique PO number.');
      }
    } else {
      // Admin/other staff must provide a PO number
      if (!data.poNumber) {
        throw new BadRequestException('poNumber is required when creating an order as staff. Provide a unique PO number.');
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
    if (user?.role === 'CUSTOMER' || user?.role === 'CAD_DESIGNER') {
      throw new ForbiddenException('Not authorized to change order status directly');
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
