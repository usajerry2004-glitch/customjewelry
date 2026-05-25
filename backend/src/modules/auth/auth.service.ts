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
    const seeds = [
      { firstName: 'Admin', lastName: 'User', email: 'admin@kirajewels.one', password: 'admin123', role: UserRole.ADMIN },
      { firstName: 'Sarah', lastName: 'Chen', email: 'sales@kirajewels.one', password: 'sales123', role: UserRole.SALES_REP },
      { firstName: 'Maya', lastName: 'Patel', email: 'cad@kirajewels.one', password: 'cad123', role: UserRole.CAD_DESIGNER },
      { firstName: 'Jake', lastName: 'Morris', email: 'sku@kirajewels.one', password: 'sku123', role: UserRole.SKU_MANAGER },
      { firstName: 'Emma', lastName: 'Thompson', email: 'customer@example.com', password: 'customer123', role: UserRole.CUSTOMER },
    ];
    for (const seed of seeds) {
      const exists = await this.userRepo.findOne({ where: { email: seed.email } });
      if (exists) continue;
      const passwordHash = await bcrypt.hash(seed.password, 10);
      await this.userRepo.save(this.userRepo.create({ ...seed, passwordHash }));
    }
  }

  async me(userId: string) {
    return this.userRepo.findOne({ where: { id: userId } });
  }

  private signToken(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    };
  }
}
