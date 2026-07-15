import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { IsString, IsEmail, MinLength, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { User, UserRole } from '../../database/entities/user.entity';
import { Order, Factory, SupplySource } from '../../database/entities/order.entity';
import { Company } from '../../database/entities/company.entity';

export class CreateUserDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsEnum(UserRole) @IsOptional() role?: UserRole;
  @IsString() @IsOptional() storeName?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() salesRepId?: string;
  @IsEnum(Factory) @IsOptional() assignedFactory?: Factory;
  @IsEnum(SupplySource) @IsOptional() assignedSupplySource?: SupplySource;
  // Admin-only: attach this Customer account to an existing company (a
  // teammate) instead of creating a new standalone company for them.
  @IsString() @IsOptional() companyId?: string;
}

export class InviteUserDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsEnum(UserRole) role: UserRole;
  @IsString() @IsOptional() salesRepId?: string;
  @IsEnum(Factory) @IsOptional() assignedFactory?: Factory;
  @IsEnum(SupplySource) @IsOptional() assignedSupplySource?: SupplySource;
  @IsString() @IsOptional() companyId?: string;
}

export class UpdateUserDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsEnum(UserRole) @IsOptional() role?: UserRole;
  @IsString() @IsOptional() @MinLength(6) password?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsBoolean() @IsOptional() emailNotificationsEnabled?: boolean;
  @IsString() @IsOptional() department?: string;
  @IsString() @IsOptional() storeName?: string;
  @IsString() @IsOptional() salesRepId?: string;
  @IsEnum(Factory) @IsOptional() assignedFactory?: Factory | null;
  @IsEnum(SupplySource) @IsOptional() assignedSupplySource?: SupplySource | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
  ) {}

  async findAll(role?: string, caller?: { id: string; role: string }): Promise<User[]> {
    const qb = this.userRepo.createQueryBuilder('u');
    if (role) qb.where('u.role = :role', { role });
    // Sort customers alphabetically; sort staff by creation date
    if (role === UserRole.CUSTOMER) {
      qb.orderBy('u.firstName', 'ASC').addOrderBy('u.lastName', 'ASC');
    } else {
      qb.orderBy('u.createdAt', 'DESC');
    }
    return qb.getMany();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, caller?: { id: string; role: string }): Promise<User> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    // A Sales Rep can only ever create Customer accounts — the role they
    // request is ignored, not just hidden by the UI, so this can't be
    // bypassed by calling the API directly.
    const role = caller?.role === UserRole.SALES_REP ? UserRole.CUSTOMER : (dto.role || UserRole.CUSTOMER);

    let salesRepId: string | undefined = caller?.role === UserRole.SALES_REP ? caller.id : dto.salesRepId;
    let company: Company | undefined;

    if (role === UserRole.CUSTOMER) {
      if (dto.companyId) {
        // Adding a teammate to an existing company — one Sales Rep per
        // company, so this is inherited, not chosen, and only Admin can do it.
        if (caller?.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only Admin can add a teammate to an existing company.');
        }
        company = (await this.companyRepo.findOne({ where: { id: dto.companyId } })) ?? undefined;
        if (!company) throw new BadRequestException('Company not found.');
        salesRepId = company.salesRepId || undefined;
      } else {
        if (caller?.role !== UserRole.SALES_REP) {
          if (!salesRepId) throw new BadRequestException('A Sales Rep must be assigned to every customer account.');
          const rep = await this.userRepo.findOne({ where: { id: salesRepId } });
          if (!rep || rep.role !== UserRole.SALES_REP) {
            throw new BadRequestException('salesRepId must reference an existing Sales Rep.');
          }
        }
        company = await this.companyRepo.save(this.companyRepo.create({
          name: dto.storeName?.trim() || `${dto.firstName} ${dto.lastName}`.trim(),
          salesRepId: salesRepId || null,
        }));
      }
    }

    const user = this.userRepo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
      passwordHash,
      role,
      salesRepId,
      companyId: company?.id,
      storeName: company?.name ?? dto.storeName,
      // Not restricted to one role: a Stone Manager account may also be tagged
      // with a factory (e.g. one contact who handles both stones and factory
      // orders for the same outside partner) and still receive factory-side
      // notifications alongside their normal Stone Manager queue.
      assignedFactory: dto.assignedFactory,
      assignedSupplySource: dto.assignedSupplySource,
    });
    return this.userRepo.save(user);
  }

  async update(id: string, dto: UpdateUserDto, caller?: { id: string }): Promise<User> {
    const user = await this.findOne(id);
    if (dto.role !== undefined && dto.role !== user.role && id === caller?.id) {
      throw new BadRequestException('You cannot change your own role');
    }
    if (dto.password) {
      (user as any).passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.emailNotificationsEnabled !== undefined) user.emailNotificationsEnabled = dto.emailNotificationsEnabled;
    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      if (email !== user.email) {
        const existing = await this.userRepo.findOne({ where: { email } });
        if (existing && existing.id !== id) throw new ConflictException('Email already registered');
        user.email = email;
      }
    }
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.department !== undefined) user.department = dto.department;
    if (dto.storeName !== undefined) {
      user.storeName = dto.storeName;
      // Keep the whole company's display name in sync — a Customer with
      // teammates shouldn't show a different company name per person.
      if (user.companyId) {
        await this.companyRepo.update(user.companyId, { name: dto.storeName });
        await this.userRepo.update({ companyId: user.companyId }, { storeName: dto.storeName });
      }
    }
    if (dto.assignedFactory !== undefined) user.assignedFactory = dto.assignedFactory;
    if (dto.assignedSupplySource !== undefined) user.assignedSupplySource = dto.assignedSupplySource;
    if (dto.salesRepId !== undefined) {
      if (dto.salesRepId) {
        const rep = await this.userRepo.findOne({ where: { id: dto.salesRepId } });
        if (!rep || rep.role !== UserRole.SALES_REP) {
          throw new BadRequestException('salesRepId must reference an existing Sales Rep.');
        }
      }
      const nextSalesRepId = (dto.salesRepId || null) as any;
      user.salesRepId = nextSalesRepId;
      // One Sales Rep per company — changing it here changes it for every teammate.
      if (user.companyId) {
        await this.companyRepo.update(user.companyId, { salesRepId: nextSalesRepId });
        await this.userRepo.update({ companyId: user.companyId }, { salesRepId: nextSalesRepId });
      }
    }
    return this.userRepo.save(user);
  }

  async getCustomerOrders(customerId: string): Promise<{ orders: Order[]; total: number }> {
    const user = await this.findOne(customerId);
    // Companies share order visibility — this shows every teammate's orders,
    // not just the ones this specific person placed. The customerId/email
    // clauses stay as a fallback for orders placed before companies existed.
    const where = user.companyId
      ? [{ companyId: user.companyId }, { customerId }, { customerEmail: user.email }]
      : [{ customerId }, { customerEmail: user.email }];
    const [orders, total] = await this.orderRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
    });
    return { orders, total };
  }

  // Teammates at the same company as this customer (including themselves).
  async getCompanyTeammates(customerId: string): Promise<User[]> {
    const user = await this.findOne(customerId);
    if (!user.companyId) return [user];
    return this.userRepo.find({ where: { companyId: user.companyId }, order: { createdAt: 'ASC' } });
  }

  async togglePriority(id: string): Promise<User> {
    const user = await this.findOne(id);
    user.isPriority = !user.isPriority;
    await this.userRepo.save(user);
    // Sync isPriorityCustomer on all orders for this customer
    await this.orderRepo.update(
      { customerId: id },
      { isPriorityCustomer: user.isPriority },
    );
    return user;
  }

  async inviteStaff(dto: InviteUserDto, caller?: { id: string; role: string }): Promise<{ user: User; tempPassword: string }> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const rand = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const tempPassword = `KiRa-${rand(4)}-${rand(4)}`;
    const user = await this.create({ ...dto, password: tempPassword }, caller);
    return { user, tempPassword };
  }

  async remove(id: string, callerId: string): Promise<void> {
    if (id === callerId) throw new BadRequestException('You cannot remove your own account');
    const user = await this.findOne(id);
    await this.userRepo.remove(user);
  }

  async getStats(): Promise<{ totalCustomers: number; activeCustomers: number; totalStaff: number }> {
    const totalCustomers = await this.userRepo.count({ where: { role: UserRole.CUSTOMER } });
    const activeCustomers = await this.userRepo.count({ where: { role: UserRole.CUSTOMER, isActive: true } });
    const totalStaff = await this.userRepo.count();
    return { totalCustomers, activeCustomers, totalStaff };
  }
}
