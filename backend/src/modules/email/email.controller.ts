import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { EmailService } from './email.service';

@ApiTags('Email')
@ApiBearerAuth()
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('test')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Send a test email to the admin — Admin only' })
  async sendTest(@Body() body: { to?: string; subject?: string } = {}) {
    const to = body.to || 'princy.k@kirajewels.one';
    const subject = body.subject || 'Kira Custom Jewelry — Email System Test';
    const sent = await this.emailService.send({
      to,
      subject,
      html: `
        <!DOCTYPE html>
        <html><body style="font-family:Arial,sans-serif;padding:40px;background:#f5f4f0">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e8e4dc">
            <div style="font-size:20px;font-weight:700;color:#C09B58;margin-bottom:8px">KIRA CUSTOM JEWELRY</div>
            <h2 style="color:#1A2740;margin:0 0 16px">Email System is Working ✓</h2>
            <p>This is a test email from the Kira Custom Jewelry Order Management Platform.</p>
            <p style="color:#6B7280;font-size:13px">Sent at: ${new Date().toISOString()}</p>
          </div>
        </body></html>
      `,
    });
    return { sent, to, subject };
  }
}
