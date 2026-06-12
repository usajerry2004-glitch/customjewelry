import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ShippingService } from './shipping.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

@ApiTags('Shipping')
@ApiBearerAuth()
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Get('ready')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get manufactured orders ready to ship' })
  getReadyToShip() {
    return this.shippingService.getReadyToShip();
  }

  @Get('shipped')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get shipped/delivered orders' })
  getShipped() {
    return this.shippingService.getShipped();
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Shipping metrics' })
  getMetrics() {
    return this.shippingService.getMetrics();
  }

  @Patch(':id/dispatch')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Dispatch order — requires tracking number' })
  dispatch(
    @Param('id') id: string,
    @Body() body: { trackingNumber: string; shipMethod?: string },
  ) {
    return this.shippingService.dispatch(id, body);
  }

}
