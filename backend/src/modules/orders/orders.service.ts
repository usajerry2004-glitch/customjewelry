import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../database/entities/order.entity';

export class OrderFilterDto {
  search?: string;
  status?: OrderStatus;
  vendorName?: string;
  dateFrom?: string;
  dateTo?: string;
  offset?: number;
  limit?: number;
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
      qb.andWhere('order.customerEmail = :email', { email: user.email });
    } else if (user?.role === 'CAD_DESIGNER') {
      qb.andWhere('order.status IN (:...cadStatuses)', { cadStatuses: CAD_STATUSES });
    }

    if (filters.status) qb.andWhere('order.status = :status', { status: filters.status });
    if (filters.search) {
      qb.andWhere(
        '(order.poNumber LIKE :s OR order.storeName LIKE :s OR order.kiraSkuNumber LIKE :s)',
        { s: `%${filters.search}%` },
      );
    }
    qb.orderBy('order.createdAt', 'DESC')
      .skip(filters.offset || 0)
      .take(filters.limit || 50);
    const [orders, total] = await qb.getManyAndCount();
    return { orders, total };
  }

  async findOne(id: string, user?: { email: string; role: string }): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (user?.role === 'CUSTOMER' && order.customerEmail !== user.email) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async create(dto: Partial<Order>, user?: { id: string; email: string; firstName?: string; lastName?: string; role: string }): Promise<Order> {
    const data: Partial<Order> = { ...dto };
    if (user?.role === 'CUSTOMER') {
      data.customerId = user.id;
      data.customerEmail = user.email;
      if (!data.customerFullName) {
        data.customerFullName = `${(user as any).firstName || ''} ${(user as any).lastName || ''}`.trim() || user.email;
      }
      if (!data.poNumber) {
        const count = await this.orderRepo.count();
        data.poNumber = `KJ-CUST-${String(count + 1).padStart(4, '0')}`;
      }
    }
    const order = this.orderRepo.create(data);
    return this.orderRepo.save(order);
  }

  async update(id: string, dto: Partial<Order>, user?: { email: string; role: string }): Promise<Order> {
    const order = await this.findOne(id, user);
    Object.assign(order, dto);
    return this.orderRepo.save(order);
  }

  async updateStatus(id: string, status: OrderStatus, user?: { email: string; role: string }): Promise<Order> {
    if (user?.role === 'CUSTOMER' || user?.role === 'CAD_DESIGNER') {
      throw new ForbiddenException('Not authorized to change order status directly');
    }
    return this.update(id, { status }, user);
  }

  async getKanbanBoard(user?: { role: string }) {
    const statuses = Object.values(OrderStatus);
    return Promise.all(
      statuses.map(async (status) => {
        const qb = this.orderRepo.createQueryBuilder('o')
          .where('o.status = :status', { status })
          .andWhere('o.isArchived = false');
        if (user?.role === 'CAD_DESIGNER') {
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
