import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ManufacturingService } from './manufacturing.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

@ApiTags('Manufacturing')
@ApiBearerAuth()
@Controller('manufacturing')
export class ManufacturingController {
  constructor(private readonly manufacturingService: ManufacturingService) {}

  @Get('queue')
  @Roles(UserRole.ADMIN, UserRole.FACTORY_MANAGER, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get manufacturing queue' })
  getQueue() {
    return this.manufacturingService.getQueue();
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.FACTORY_MANAGER, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Manufacturing metrics' })
  getMetrics() {
    return this.manufacturingService.getMetrics();
  }

  @Patch(':id/start')
  @Roles(UserRole.ADMIN, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Issue VPO and start production' })
  startProduction(
    @Param('id') id: string,
    @Body() body: { vpoNumber?: string; jobBagNumber?: string; notes?: string },
  ) {
    return this.manufacturingService.startProduction(id, body);
  }

  @Patch(':id/contractor')
  @Roles(UserRole.ADMIN, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Move order to Pending Contractor' })
  moveToContractor(
    @Param('id') id: string,
    @Body() body: { jobBagNumber?: string; vendorName?: string },
  ) {
    return this.manufacturingService.moveToContractor(id, body);
  }

  @Patch(':id/stone-sent')
  @Roles(UserRole.ADMIN, UserRole.STONE_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Stone Manager marks stone as sent — auto sets Stone Received, notifies Factory Manager' })
  markStoneSent(@Param('id') id: string) {
    return this.manufacturingService.markStoneSent(id);
  }

  @Patch(':id/complete')
  @Roles(UserRole.ADMIN, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Mark manufacturing complete — moves to READY_TO_SHIP' })
  complete(@Param('id') id: string) {
    return this.manufacturingService.completeManufacturing(id);
  }
}
