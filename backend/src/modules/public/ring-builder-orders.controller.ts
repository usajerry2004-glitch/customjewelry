import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequireApiKey } from '../../common/decorators/require-api-key.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { RingBuilderOrdersService, RingBuilderOrderDto } from './ring-builder-orders.service';

@ApiTags('Public')
@Controller('public/ring-builder')
@Public()
@UseGuards(ApiKeyGuard)
@RequireApiKey('RING_BUILDER_API_KEY')
export class RingBuilderOrdersController {
  constructor(private readonly service: RingBuilderOrdersService) {}

  @Post('orders')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Submit a Ring Builder checkout as one or more custom orders (no auth — API key required)' })
  async submitRingBuilderOrder(@Body() body: RingBuilderOrderDto) {
    return this.service.createFromRingBuilder(body);
  }

  @Get('orders/:externalOrderId')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: "Poll an order's current status by the website's own order number (no auth — API key required)" })
  async getRingBuilderOrder(@Param('externalOrderId') externalOrderId: string) {
    return this.service.getOrderByExternalId(externalOrderId);
  }
}
