import { Controller, Post, Get, Body, Res, UseGuards, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { EmailService } from '../email/email.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';

const isProduction = process.env.NODE_ENV === 'production';

// Frontend (dashboard.kirajewels.one) and API (dashboardapi.kirajewels.one) are
// sibling subdomains — without an explicit `domain`, the cookie defaults to the
// exact API host and is never visible outside it. `sameSite: 'strict'` also has
// no benefit here (both hosts share the same registrable domain) and only adds
// edge cases where the cookie fails to attach. `logout` must use the exact same
// options or `clearCookie` won't match the cookie it's trying to remove.
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction,
  domain: isProduction ? '.kirajewels.one' : undefined,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /auth/login
   * Rate-limited: max 10 attempts per minute per IP.
   * This stops brute-force password attacks.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login and receive JWT (also sets httpOnly cookie)' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    res.cookie('jf_token', result.access_token, COOKIE_OPTIONS);
    return result;
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Clear auth cookie' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('jf_token', COOKIE_OPTIONS);
    return { ok: true };
  }

  /**
   * POST /auth/register
   * Requires ADMIN role — staff accounts are created by the admin only.
   * Customers get accounts via the admin Customers page.
   */
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @Post('register')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new staff account (Admin only)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset link via email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const token = await this.authService.forgotPassword(dto.email);
    if (!token) {
      this.logger.warn(`Password reset requested for unknown email: ${dto.email}`);
      return { found: false, message: 'No account found with that email address.' };
    }
    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000').split(',')[0].trim();
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    this.logger.log(`\n\n🔑 PASSWORD RESET LINK for ${dto.email}:\n${resetUrl}\n`);
    const sent = await this.emailService.sendPasswordResetEmail({ to: dto.email, token });
    this.logger.log(`Email delivery for ${dto.email}: ${sent ? 'SUCCESS' : 'FAILED — use the link above'}`);
    return { found: true, message: 'A password reset link has been sent to your email.' };
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using a valid reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: 'Password updated successfully.' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  me(@CurrentUser() user: any) {
    return this.authService.me(user.id);
  }
}
