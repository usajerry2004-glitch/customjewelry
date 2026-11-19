import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { EmailRepliesService } from './email-replies.service';

@ApiTags('Email Replies')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('email-replies')
export class EmailRepliesController {
  constructor(private readonly service: EmailRepliesService) {}

  // Admin-only: every customer reply to a follow-up email the inbox check picked up.
  @Roles(UserRole.ADMIN)
  @Get()
  list(@Query('outcome') outcome?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.list(outcome, Number(limit) || 50, Number(offset) || 0);
  }
}
