import {
  Controller, Post, Body, UploadedFiles, UseInterceptors,
  Headers, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { PublicOrdersService } from './public-orders.service';

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'cad'),
  filename: (_, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + extname(file.originalname));
  },
});

@ApiTags('Public')
@Controller('public')
export class PublicOrdersController {
  private readonly logger = new Logger(PublicOrdersController.name);

  constructor(
    private readonly service: PublicOrdersService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /api/v1/public/orders
   * Called by the WordPress PHP form — no JWT required.
   * Protected by x-api-key header (shared secret).
   */
  @Post('orders')
  @Public()
  @UseInterceptors(FilesInterceptor('files', 5, { storage }))
  @ApiOperation({ summary: 'Submit order from external website (no auth — API key required)' })
  async submitWebOrder(
    @Headers('x-api-key') apiKey: string,
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    // Validate API key
    const expected = this.config.get<string>('WORDPRESS_API_KEY', '');
    if (!expected || apiKey !== expected) {
      this.logger.warn(`Web order rejected — invalid API key`);
      throw new ForbiddenException('Invalid API key');
    }

    // Require at minimum email + first name
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
}
