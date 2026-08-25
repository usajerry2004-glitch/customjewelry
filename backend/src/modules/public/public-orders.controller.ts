import {
  Controller, Post, Get, Patch, Body, Param,
  UploadedFiles, UseInterceptors, UseGuards,
  BadRequestException, Logger,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequireApiKey } from '../../common/decorators/require-api-key.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { PublicOrdersService } from './public-orders.service';

@ApiTags('Public')
@Controller('public')
export class PublicOrdersController {
  private readonly logger = new Logger(PublicOrdersController.name);

  constructor(
    private readonly service: PublicOrdersService,
  ) {}

  // ── WordPress / web form order submission ─────────────────────────────
  @Post('orders')
  @Public()
  @UseGuards(ApiKeyGuard)
  @RequireApiKey('WORDPRESS_API_KEY', ['KiRa@WebForm#2026!'])
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'Submit order from external website (no auth — API key required)' })
  async submitWebOrder(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!body.email || !body.firstName) {
      throw new BadRequestException('email and firstName are required');
    }

    return this.service.createFromWebForm(
      {
        firstName:   body.firstName,
        lastName:    body.lastName || '',
        storeName:   body.storeName || body.companyName || body.company_name,
        email:       body.email,
        phoneNumber: body.phoneNumber || body.phone,
        orderType:   body.orderType || body.type,
        size:        body.size,
        metalType:   body.metalType || body.metal_type,
        metalColor:  body.metalColor || body.metal_color,
        diamondQuality: body.diamondQuality || body.diamond_quality,
        diamondType:    body.diamondType || body.diamond_type,
        centerStoneShape: body.centerStoneShape || body.center_stone_shape,
        approximateCaratWeight: body.approximateCaratWeight || body.carat_weight,
        hasGemstone: ['true', 'yes', 'on', '1'].includes(String(body.hasGemstone ?? body.has_gemstone ?? body.gemstone ?? '').toLowerCase()),
        referenceWeblink: body.referenceWeblink || body.reference_weblink || body.reference_url,
        refCustomerPo: body.refCustomerPo || body.customer_po || body.po_number,
        stockNumber:   body.stockNumber || body.stock_no,
        customerNotes: body.customerNotes || body.comments || body.notes,
      },
      files || [],
    );
  }

  // ── Customer order tracking (magic link, no auth) ─────────────────────
  @Get('track/:token')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get order status by tracking token' })
  async getTracking(@Param('token') token: string) {
    return this.service.getOrderByToken(token);
  }

  @Patch('track/:token/cad/:cadId/approve')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Customer approves a CAD design' })
  async approveCad(
    @Param('token') token: string,
    @Param('cadId') cadId: string,
  ) {
    return this.service.approveCad(token, cadId);
  }

  @Patch('track/:token/cad/:cadId/reject')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Customer requests CAD revision' })
  async rejectCad(
    @Param('token') token: string,
    @Param('cadId') cadId: string,
    @Body() body: any,
  ) {
    return this.service.rejectCad(token, cadId, body?.feedback || '');
  }

  // ── Approval-stall check-in survey (magic link, no auth) ───────────────
  @Get('survey/:token')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get order context for the approval check-in survey' })
  async getSurvey(@Param('token') token: string) {
    return this.service.getSurveyContext(token);
  }

  @Post('survey/:token')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Customer answers the approval check-in survey' })
  async submitSurvey(
    @Param('token') token: string,
    @Body() body: any,
  ) {
    return this.service.submitApprovalStallSurvey(token, body?.reason, body?.subReason);
  }

  // ── Post-completion feedback survey (magic link, no auth) ──────────────
  @Get('feedback/:token')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get order context for the post-completion feedback survey' })
  async getFeedback(@Param('token') token: string) {
    return this.service.getFeedbackContext(token);
  }

  @Post('feedback/:token')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Customer submits the post-completion feedback survey' })
  async submitFeedback(
    @Param('token') token: string,
    @Body() body: any,
  ) {
    return this.service.submitFeedback(token, body?.experienceRating, body?.priceRating, body?.qualityRating, body?.comments);
  }
}
