import {
  Controller, Post, Get, Patch, Body, Param,
  UploadedFiles, UseInterceptors,
  Headers, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { PublicOrdersService } from './public-orders.service';

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.pdf', '.3dm', '.dwg', '.dxf', '.obj', '.stl',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'cad'),
  filename: (_, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + extname(file.originalname));
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const ext = extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestException(
        `File type not allowed: ${extname(file.originalname)}. Accepted: images (jpg, png, gif, webp, svg), PDF, and CAD files (.3dm, .dwg, .dxf, .obj, .stl)`,
      ),
      false,
    );
  }
};

@ApiTags('Public')
@Controller('public')
export class PublicOrdersController {
  private readonly logger = new Logger(PublicOrdersController.name);

  constructor(
    private readonly service: PublicOrdersService,
    private readonly config: ConfigService,
  ) {}

  // ── WordPress / web form order submission ─────────────────────────────
  @Post('orders')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseInterceptors(AnyFilesInterceptor({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE, files: 3 } }))
  @ApiOperation({ summary: 'Submit order from external website (no auth — API key required)' })
  async submitWebOrder(
    @Headers('x-api-key') apiKey: string,
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const expected = this.config.get<string>('WORDPRESS_API_KEY', '');
    if (!expected || apiKey !== expected) {
      this.logger.warn(`Web order rejected — invalid API key`);
      throw new ForbiddenException('Invalid API key');
    }

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
}
