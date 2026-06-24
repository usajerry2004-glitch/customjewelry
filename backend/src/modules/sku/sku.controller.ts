import { Controller, Post, Get, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkuService } from './sku.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('SKU')
@ApiBearerAuth()
@Controller('sku')
export class SkuController {
  constructor(private readonly skuService: SkuService) {}

  @Get()
  @ApiOperation({ summary: 'List all SKUs' })
  findAll(@Query('search') search?: string) {
    return this.skuService.findAll(search);
  }

  @Post('generate/:orderId')
  @ApiOperation({ summary: 'Generate SKU for an order' })
  generate(@Param('orderId') orderId: string, @Request() req: any) {
    return this.skuService.generate(orderId, req.user?.email);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get SKU by ID' })
  findOne(@Param('id') id: string) {
    return this.skuService.findOne(id);
  }
}
