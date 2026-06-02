import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../../database/entities/user.entity';
import { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash,
      role: dto.role || UserRole.SALES_REP,
    });
    const saved = await this.userRepo.save(user);
    return this.signToken(saved);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: dto.email })
      .getOne();

    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.signToken(user);
  }

  async seedAdmin() {
    // Passwords sourced from env vars; fall back to strong defaults.
    // These are ONLY used when creating accounts for the first time (if they don't exist).
    // Existing accounts are NOT modified on each restart.
    const seeds = [
      { firstName: 'Admin',    lastName: 'User',     email: 'admin@kirajewels.one',      password: process.env.SEED_ADMIN_PASSWORD    || 'KiRa@Admin#2025!',    role: UserRole.ADMIN },
      { firstName: 'Sarah',    lastName: 'Chen',     email: 'sales@kirajewels.one',       password: process.env.SEED_SALES_PASSWORD    || 'KiRa@Sales#2025!',    role: UserRole.SALES_REP },
      { firstName: 'Raj',      lastName: 'Sharma',   email: 'authorizer@kirajewels.one',  password: process.env.SEED_AUTH_PASSWORD     || 'KiRa@Auth#2025!',     role: UserRole.AUTHORIZER },
      { firstName: 'Maya',     lastName: 'Patel',    email: 'cad@kirajewels.one',         password: process.env.SEED_CAD_PASSWORD      || 'KiRa@CadDesign#2025!', role: UserRole.CAD_DESIGNER },
      { firstName: 'Jake',     lastName: 'Morris',   email: 'sku@kirajewels.one',         password: process.env.SEED_SKU_PASSWORD      || 'KiRa@SkuMgr#2025!',   role: UserRole.SKU_MANAGER },
      { firstName: 'Arjun',   lastName: 'Singh',    email: 'factory@kirajewels.one',     password: process.env.SEED_FACTORY_PASSWORD  || 'KiRa@Factory#2025!',  role: UserRole.FACTORY_MANAGER },
      { firstName: 'Lisa',     lastName: 'Nguyen',   email: 'shipping@kirajewels.one',    password: process.env.SEED_SHIPPING_PASSWORD || 'KiRa@Shipping#2025!', role: UserRole.SHIPPING_MANAGER },
      { firstName: 'Emma',     lastName: 'Thompson', email: 'customer@example.com',       password: process.env.SEED_CUSTOMER_PASSWORD || 'KiRa@Customer#2025!', role: UserRole.CUSTOMER },

      // Additional Sales Reps for testing
      { firstName: 'Michael',  lastName: 'Johnson',  email: 'sales2@kirajewels.one',      password: 'KiRa@Sales2#2025!',   role: UserRole.SALES_REP },
      { firstName: 'Jessica',  lastName: 'Williams', email: 'sales3@kirajewels.one',      password: 'KiRa@Sales3#2025!',   role: UserRole.SALES_REP },

      // Additional Customers for testing
      { firstName: 'John',     lastName: 'Anderson', email: 'john.anderson@customer.com', password: 'KiRa@Cust1#2025!',    role: UserRole.CUSTOMER },
      { firstName: 'Amanda',   lastName: 'Martinez', email: 'amanda.martinez@customer.com', password: 'KiRa@Cust2#2025!',  role: UserRole.CUSTOMER },
      { firstName: 'David',    lastName: 'Brown',    email: 'david.brown@customer.com',   password: 'KiRa@Cust3#2025!',    role: UserRole.CUSTOMER },
    ];
    for (const seed of seeds) {
      const exists = await this.userRepo.findOne({ where: { email: seed.email } });
      if (exists) continue; // Never overwrite existing accounts
      const passwordHash = await bcrypt.hash(seed.password, 10);
      await this.userRepo.save(this.userRepo.create({ ...seed, passwordHash }));
    }
  }

  async me(userId: string) {
    return this.userRepo.findOne({ where: { id: userId } });
  }

  private signToken(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    };
  }
}
