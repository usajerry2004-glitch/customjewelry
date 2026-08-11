import { Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

// Defaults to the Monday-through-Sunday week that most recently ended —
// same window the Monday 8am cron computes — unless a specific start date
// is given, so this can be tested against any past week.
function resolveWeekRange(weekStartParam?: string): { weekStart: Date; weekEnd: Date } {
  if (weekStartParam) {
    const weekStart = new Date(`${weekStartParam}T00:00:00`);
    const weekEnd = new Date(weekStart.getTime() + 6 * DAY_MS);
    weekEnd.setHours(23, 59, 59, 999);
    return { weekStart, weekEnd };
  }
  const now = new Date();
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
  const weekStart = new Date(weekEnd.getTime() - 6 * DAY_MS);
  weekStart.setHours(0, 0, 0, 0);
  return { weekStart, weekEnd };
}

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('weekly/preview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Preview the computed weekly stats as JSON, without sending an email (Admin only)' })
  async preview(@Query('weekStart') weekStartParam?: string) {
    const { weekStart, weekEnd } = resolveWeekRange(weekStartParam);
    return this.reportsService.getWeeklyStats(weekStart, weekEnd);
  }

  @Post('weekly/send')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Build and email the weekly operations report now, for testing (Admin only)' })
  async sendNow(@Query('weekStart') weekStartParam?: string) {
    const { weekStart, weekEnd } = resolveWeekRange(weekStartParam);
    await this.reportsService.sendWeeklyReport(weekStart, weekEnd);
    return { sent: true };
  }

  @Get('weekly/designer-files')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Diagnostic: every CAD file behind the weekly report\'s per-designer table, with actual createdAt/approvedAt/turnaround, sorted fastest-first — for tracing an implausible average back to specific orders (Admin only)' })
  async designerFiles(@Query('weekStart') weekStartParam?: string) {
    const { weekStart, weekEnd } = resolveWeekRange(weekStartParam);
    return this.reportsService.getDesignerFilesDetail(weekStart, weekEnd);
  }

  @Get('audit-log')
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER)
  @ApiOperation({ summary: 'Audit log of status changes, supplier assignments, and edits — admins see every order, other staff see only their own actions (not available to customers)' })
  auditLog(
    @Request() req: any,
    @Query('userEmail') userEmail?: string,
    @Query('action') action?: string,
    @Query('poNumber') poNumber?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.reportsService.getAuditLog({
      userEmail, action, poNumber, dateFrom, dateTo,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    }, req.user);
  }

  @Get('monthly-production')
  @Roles(UserRole.ADMIN, UserRole.CAD_DESIGNER)
  @ApiOperation({ summary: 'Monthly Production Report — Direct Orders Received, CADs Made, Samples Approved (proxy: CAD approvals), Revisions Completed (inferred). Available to Admin and CAD Designer.' })
  monthlyProduction(
    @Query('period') period?: string,
    @Query('month') month?: string,
  ) {
    const periodType = ['monthly', 'quarterly', 'halfyearly', 'yearly'].includes(period || '') ? (period as any) : 'monthly';
    const anchorMonth = month || new Date().toISOString().slice(0, 7);
    return this.reportsService.getMonthlyProductionReport(periodType, anchorMonth);
  }

  @Get('cad-tracking')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin-only Reports tab: per-CAD-person daily style counts, split by Kira/V+V channel, approval rate, and revision activity, computed live from cad_files + orders (?dateFrom/?dateTo, YYYY-MM-DD, default last 7 days).' })
  cadTracking(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.reportsService.getCadTrackingReport(dateFrom, dateTo);
  }
}
