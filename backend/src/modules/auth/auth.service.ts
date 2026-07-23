import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { User, UserRole } from '../../database/entities/user.entity';
import { LoginDto, RegisterDto } from './dto/auth.dto';

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
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
      .where('LOWER(u.email) = LOWER(:email)', { email: dto.email.trim() })
      .getOne();

    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.signToken(user);
  }

  async requestOtp(email: string): Promise<{ found: boolean; otp?: string; firstName?: string }> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:email)', { email: email.trim() })
      .getOne();
    if (!user) return { found: false };

    const otp = String(randomInt(100000, 1000000));
    user.otpCodeHash = await bcrypt.hash(otp, 10);
    user.otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    user.otpAttempts = 0;
    await this.userRepo.save(user);

    return { found: true, otp, firstName: user.firstName };
  }

  async verifyOtp(email: string, otp: string) {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.otpCodeHash')
      .where('LOWER(u.email) = LOWER(:email)', { email: email.trim() })
      .getOne();

    const invalid = () => new UnauthorizedException('Invalid or expired code');
    if (!user || !user.otpCodeHash || !user.otpExpiresAt) throw invalid();
    if (user.otpExpiresAt.getTime() < Date.now()) throw invalid();
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) throw invalid();

    const valid = await bcrypt.compare(otp, user.otpCodeHash);
    if (!valid) {
      user.otpAttempts += 1;
      await this.userRepo.save(user);
      throw invalid();
    }

    user.otpCodeHash = null as any;
    user.otpExpiresAt = null as any;
    user.otpAttempts = 0;
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    return this.signToken(user);
  }

  async forgotPassword(email: string): Promise<string | null> {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:email)', { email: email.trim() })
      .getOne();
    if (!user) return null; // don't reveal if email exists
    const secret = `${this.config.get('JWT_SECRET', 'dev-secret')}:reset`;
    const token = this.jwtService.sign(
      { sub: user.id, type: 'password_reset' },
      { secret, expiresIn: '1h' },
    );
    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const secret = `${this.config.get('JWT_SECRET', 'dev-secret')}:reset`;
    let payload: any;
    try {
      payload = this.jwtService.verify(token, { secret });
    } catch {
      throw new BadRequestException('Reset link is invalid or has expired.');
    }
    if (payload?.type !== 'password_reset') {
      throw new BadRequestException('Invalid reset token.');
    }
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new BadRequestException('User not found.');
    (user as any).passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.save(user);
  }

  async seedAdmin() {
    // Only ever seed a completely empty database (fresh local/dev setup).
    // Checking each account by its hardcoded default email would otherwise
    // recreate these as duplicates the moment a real admin renames or
    // deletes one — the old email just looks "unused" again on the next restart.
    const userCount = await this.userRepo.count();
    if (userCount > 0) return;

    // Passwords sourced from env vars; fall back to strong defaults.
    // These are ONLY used when creating accounts for the first time (if they don't exist).
    // Existing accounts are NOT modified on each restart.
    const seeds = [
      { firstName: 'Admin',    lastName: 'User',     email: 'admin@kirajewels.one',      password: process.env.SEED_ADMIN_PASSWORD    || 'KiRa@Admin#2025!',    role: UserRole.ADMIN },
      { firstName: 'Sarah',    lastName: 'Chen',     email: 'sales@kirajewels.one',       password: process.env.SEED_SALES_PASSWORD    || 'KiRa@Sales#2025!',    role: UserRole.SALES_REP },
      { firstName: 'Raj',      lastName: 'Sharma',   email: 'authorizer@kirajewels.one',  password: process.env.SEED_AUTH_PASSWORD     || 'KiRa@Auth#2025!',     role: UserRole.AUTHORIZER },
      { firstName: 'Maya',     lastName: 'Patel',    email: 'cad@kirajewels.one',         password: process.env.SEED_CAD_PASSWORD      || 'KiRa@CadDesign#2025!', role: UserRole.CAD_DESIGNER },
      { firstName: 'Arjun',   lastName: 'Singh',    email: 'factory@kirajewels.one',     password: process.env.SEED_FACTORY_PASSWORD  || 'KiRa@Factory#2025!',  role: UserRole.FACTORY_MANAGER },
      { firstName: 'Priya',    lastName: 'Mehta',    email: 'stone@kirajewels.one',       password: process.env.SEED_STONE_PASSWORD    || 'KiRa@Stone#2025!',    role: UserRole.STONE_MANAGER },
      { firstName: 'Emma',     lastName: 'Thompson', email: 'customer@example.com',       password: process.env.SEED_CUSTOMER_PASSWORD || 'KiRa@Customer#2025!', role: UserRole.CUSTOMER },

    ];

    // Dev-only test accounts — never created in production
    const devSeeds = process.env.NODE_ENV !== 'production' ? [
      { firstName: 'Michael',  lastName: 'Johnson',  email: 'sales2@kirajewels.one',        password: 'KiRa@Sales2#2025!', role: UserRole.SALES_REP },
      { firstName: 'Jessica',  lastName: 'Williams', email: 'sales3@kirajewels.one',        password: 'KiRa@Sales3#2025!', role: UserRole.SALES_REP },
      { firstName: 'John',     lastName: 'Anderson', email: 'john.anderson@customer.com',   password: 'KiRa@Cust1#2025!',  role: UserRole.CUSTOMER },
      { firstName: 'Amanda',   lastName: 'Martinez', email: 'amanda.martinez@customer.com', password: 'KiRa@Cust2#2025!',  role: UserRole.CUSTOMER },
      { firstName: 'David',    lastName: 'Brown',    email: 'david.brown@customer.com',     password: 'KiRa@Cust3#2025!',  role: UserRole.CUSTOMER },
    ] : [];
    seeds.push(...devSeeds);
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
    const payload = {
      sub: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName,
      assignedFactory: user.assignedFactory, assignedSupplySource: user.assignedSupplySource,
      companyId: user.companyId,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role,
        assignedFactory: user.assignedFactory, assignedSupplySource: user.assignedSupplySource,
        companyId: user.companyId, extraPermissions: user.extraPermissions,
      },
    };
  }
}
