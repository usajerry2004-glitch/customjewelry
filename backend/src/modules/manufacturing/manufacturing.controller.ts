import { Controller, Get, Patch, Param, Body, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ManufacturingService } from './manufacturing.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { FactoryRedactionInterceptor } from '../../common/interceptors/factory-redaction.interceptor';

@ApiTags('Manufacturing')
@ApiBearerAuth()
@Controller('manufacturing')
@UseInterceptors(FactoryRedactionInterceptor)
export class ManufacturingController {
  constructor(private readonly manufacturingService: ManufacturingService) {}

  @Get('queue')
  @Roles(UserRole.ADMIN, UserRole.FACTORY_MANAGER, UserRole.FACTORY_VIEWER, UserRole.AUTHORIZER, UserRole.STONE_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get manufacturing queue (role-filtered — Stone Manager excludes Stone Creations orders)' })
  getQueue(@Request() req: any) {
    return this.manufacturingService.getQueue(req.user);
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.FACTORY_MANAGER, UserRole.FACTORY_VIEWER, UserRole.AUTHORIZER, UserRole.STONE_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Manufacturing metrics' })
  getMetrics() {
    return this.manufacturingService.getMetrics();
  }

  @Patch(':id/stone-sent')
  @Roles(UserRole.ADMIN, UserRole.STONE_MANAGER, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Mark stone as received — Stone Manager (Kira-supply orders) or Factory Manager/Admin (Stone Creations orders)' })
  markStoneSent(@Param('id') id: string, @Request() req: any) {
    return this.manufacturingService.markStoneSent(id, req.user);
  }

  @Patch(':id/complete')
  @Roles(UserRole.ADMIN, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Mark manufacturing complete — moves to MANUFACTURED' })
  complete(@Param('id') id: string, @Request() req: any) {
    return this.manufacturingService.completeManufacturing(id, req.user);
  }
}
