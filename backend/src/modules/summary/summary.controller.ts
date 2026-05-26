import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { SummaryService } from './summary.service';

@ApiTags('Summary')
@ApiBearerAuth()
@Controller('orders/:id/summary')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get or generate AI summary for an order' })
  getSummary(@Param('id') id: string) {
    return this.summaryService.getSummary(id);
  }

  @Delete()
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Clear cached AI summary' })
  clearSummary(@Param('id') id: string) {
    return this.summaryService.clearSummary(id);
  }
}
