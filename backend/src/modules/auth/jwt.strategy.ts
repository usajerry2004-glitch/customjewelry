import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';

function extractFromCookieOrBearer(req: any): string | null {
  const cookieHeader: string = req?.headers?.['cookie'] || '';
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const name = part.substring(0, idx).trim();
      if (name === 'jf_token') {
        return decodeURIComponent(part.substring(idx + 1).trim());
      }
    }
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: extractFromCookieOrBearer,
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', 'dev-secret'),
    });
  }

  // Re-checks the database on every request instead of trusting the signed
  // token's claims verbatim. Without this, removing or deactivating a user
  // (or changing their role/factory assignment) had no effect until their
  // token's own 7-day expiry — they could keep acting in the portal the
  // whole time on their existing session.
  async validate(payload: any) {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account no longer active');
    }
    return {
      id: user.id, email: user.email, role: user.role,
      firstName: user.firstName, lastName: user.lastName,
      assignedFactory: user.assignedFactory, assignedSupplySource: user.assignedSupplySource,
      companyId: user.companyId, extraPermissions: user.extraPermissions,
    };
  }
}
