import { BadRequestException, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
@Roles(UserRole.ADMIN)
@UseGuards(RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('weekly/preview')
  @ApiOperation({ summary: 'Preview the computed weekly stats as JSON, without sending an email (Admin only)' })
  async preview(@Query('weekStart') weekStartParam?: string) {
    const { weekStart, weekEnd } = resolveWeekRange(weekStartParam);
    return this.reportsService.getWeeklyStats(weekStart, weekEnd);
  }

  @Post('weekly/send')
  @ApiOperation({ summary: 'Build and email the weekly operations report now (Admin only). Optional "to" sends a one-off test copy elsewhere instead of the standing recipient.' })
  async sendNow(@Query('weekStart') weekStartParam?: string, @Query('to') to?: string) {
    if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new BadRequestException('"to" is not a valid email address.');
    }
    const { weekStart, weekEnd } = resolveWeekRange(weekStartParam);
    await this.reportsService.sendWeeklyReport(weekStart, weekEnd, to);
    return { sent: true, to: to || undefined };
  }
}
