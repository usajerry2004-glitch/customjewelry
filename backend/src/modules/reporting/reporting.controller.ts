import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { ReportingService } from './reporting.service';

@ApiTags('Reporting')
@ApiBearerAuth()
@Controller('reporting')
@Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER)
@UseGuards(RolesGuard)
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('daily-trend')
  @ApiOperation({ summary: 'Orders created + completed per day for last 7 days (dashboard chart)' })
  getDailyTrend() {
    return this.reportingService.getDailyTrend(7);
  }

  @Get('report')
  @ApiOperation({ summary: 'Get period report. period=week|month|last_month or pass from/to (YYYY-MM-DD)' })
  getReport(
    @Query('period') period: 'week' | 'month' | 'last_month' = 'month',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportingService.getReport(period, from, to);
  }
}
