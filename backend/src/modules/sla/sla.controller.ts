import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { SlaService } from './sla.service';

@ApiTags('SLA')
@ApiBearerAuth()
@Controller('sla')
@Roles(UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.SKU_MANAGER, UserRole.FACTORY_MANAGER, UserRole.SHIPPING_MANAGER, UserRole.SALES_REP)
@UseGuards(RolesGuard)
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Get('overdue')
  @ApiOperation({ summary: 'Get all currently overdue orders' })
  getOverdue() {
    return this.slaService.getOverdueOrders();
  }

  @Post('run')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Manually trigger SLA check (Admin only)' })
  runNow() {
    return this.slaService.runNow();
  }
}
