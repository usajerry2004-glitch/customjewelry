import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../database/entities/user.entity';
import { Company } from '../../database/entities/company.entity';
import { OrdersService } from '../orders/orders.service';

const RESULT_LIMIT = 6;
const MIN_QUERY_LENGTH = 2;

// Roles allowed to see customer/company results — the rest (CAD Designer,
// Factory Manager, Stone Manager) have no customer-facing relationship and
// only ever see the order results below.
const CUSTOMER_VISIBLE_ROLES = new Set([UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP]);

export interface GlobalSearchResult {
  orders: any[];
  customers: { id: string; firstName: string; lastName: string; email: string; storeName: string | null }[];
  companies: { id: string; name: string }[];
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    private readonly ordersService: OrdersService,
  ) {}

  async search(
    q: string,
    user: { id: string; email: string; role: string; companyId?: string | null; assignedFactory?: any; assignedSupplySource?: any },
  ): Promise<GlobalSearchResult> {
    const term = (q || '').trim();
    if (term.length < MIN_QUERY_LENGTH) return { orders: [], customers: [], companies: [] };

    // Reuses OrdersService's existing role-scoped visibility (Sales Rep only
    // sees their own orders, Factory/Stone Manager only their assigned ones, etc.)
    // instead of re-implementing it here.
    const { orders } = await this.ordersService.findAll({ search: term, limit: RESULT_LIMIT } as any, user as any);

    let customers: User[] = [];
    let companies: Company[] = [];

    if (CUSTOMER_VISIBLE_ROLES.has(user.role as UserRole)) {
      const escaped = term.replace(/[%_\\]/g, c => `\\${c}`);
      const s = `%${escaped}%`;

      const custQb = this.userRepo.createQueryBuilder('u')
        .where('u.role = :role', { role: UserRole.CUSTOMER })
        .andWhere('(u.firstName ILIKE :s OR u.lastName ILIKE :s OR u.email ILIKE :s OR u.storeName ILIKE :s)', { s });
      if (user.role === UserRole.SALES_REP) {
        custQb.andWhere('u.salesRepId = :salesRepId', { salesRepId: user.id });
      }
      customers = await custQb.take(RESULT_LIMIT).getMany();

      const compQb = this.companyRepo.createQueryBuilder('c').where('c.name ILIKE :s', { s });
      if (user.role === UserRole.SALES_REP) {
        compQb.andWhere('c.salesRepId = :salesRepId', { salesRepId: user.id });
      }
      companies = await compQb.take(RESULT_LIMIT).getMany();
    }

    return {
      orders,
      customers: customers.map(c => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, storeName: c.storeName || null })),
      companies: companies.map(c => ({ id: c.id, name: c.name })),
    };
  }
}
