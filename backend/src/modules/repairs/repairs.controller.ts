import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RepairsService } from './repairs.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

@ApiTags('Repairs')
@ApiBearerAuth()
@Controller('repairs')
export class RepairsController {
  constructor(private readonly repairsService: RepairsService) {}

  @Get('queue')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get all orders in repair, sorted oldest-first' })
  getQueue() {
    return this.repairsService.getQueue();
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Repair metrics — total and overdue counts' })
  getMetrics() {
    return this.repairsService.getMetrics();
  }

  @Patch(':id/complete')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Mark repair complete — moves order to COMPLETED' })
  complete(@Param('id') id: string) {
    return this.repairsService.complete(id);
  }

  @Patch(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Assign or reassign a repair contractor' })
  assign(@Param('id') id: string, @Body() body: { contractor: string }) {
    return this.repairsService.assign(id, body.contractor);
  }
}
