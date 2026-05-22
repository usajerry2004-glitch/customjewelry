import { Controller, Get, Patch, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifService: NotificationsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all notifications' })
  findAll(@Request() req: any) {
    return this.notifService.findAll(req.user?.id);
  }

  @Public()
  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async unreadCount(@Request() req: any) {
    const count = await this.notifService.unreadCount(req.user?.id);
    return { count };
  }

  @Public()
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@Request() req: any) {
    return this.notifService.markAllRead(req.user?.id);
  }

  @Public()
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@Param('id') id: string) {
    return this.notifService.markRead(id);
  }
}
