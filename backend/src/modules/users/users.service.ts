import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { IsString, IsEmail, MinLength, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { User, UserRole } from '../../database/entities/user.entity';
import { Order } from '../../database/entities/order.entity';

export class CreateUserDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsEnum(UserRole) @IsOptional() role?: UserRole;
  @IsString() @IsOptional() storeName?: string;
  @IsString() @IsOptional() phone?: string;
}

export class InviteUserDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsEmail() email: string;
  @IsEnum(UserRole) role: UserRole;
}

export class UpdateUserDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsString() @IsOptional() @MinLength(6) password?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsString() @IsOptional() department?: string;
  @IsString() @IsOptional() storeName?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
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
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      role: dto.role || UserRole.CUSTOMER,
      salesRepId: caller?.role === UserRole.SALES_REP ? caller.id : undefined,
      storeName: dto.storeName,
    });
    return this.userRepo.save(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    if (dto.password) {
      (user as any).passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.department !== undefined) user.department = dto.department;
    if (dto.storeName !== undefined) user.storeName = dto.storeName;
    return this.userRepo.save(user);
  }

  async getCustomerOrders(customerId: string): Promise<{ orders: Order[]; total: number }> {
    const user = await this.findOne(customerId);
    const [orders, total] = await this.orderRepo.findAndCount({
      where: [{ customerId }, { customerEmail: user.email }],
      order: { createdAt: 'DESC' },
    });
    return { orders, total };
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

  async inviteStaff(dto: InviteUserDto): Promise<{ user: User; tempPassword: string }> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const rand = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const tempPassword = `KiRa-${rand(4)}-${rand(4)}`;
    const user = await this.create({ ...dto, password: tempPassword });
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
