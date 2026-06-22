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
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login and receive JWT (also sets httpOnly cookie)' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('jf_token', result.access_token, {
      httpOnly: true,
      sameSite: isProduction ? 'strict' : 'lax',
      secure: isProduction,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    return result;
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Clear auth cookie' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('jf_token', { path: '/', httpOnly: true });
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
    if (token) {
      const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000').split(',')[0].trim();
      const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
      // Always log the link — use this directly if email delivery fails
      this.logger.log(`\n\n🔑 PASSWORD RESET LINK for ${dto.email}:\n${resetUrl}\n`);
      const sent = await this.emailService.sendPasswordResetEmail({ to: dto.email, token });
      this.logger.log(`Email delivery for ${dto.email}: ${sent ? 'SUCCESS' : 'FAILED — use the link above'}`);
    } else {
      this.logger.warn(`Password reset requested for unknown email: ${dto.email}`);
    }
    return { message: 'If that email exists, a reset link has been sent.' };
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
