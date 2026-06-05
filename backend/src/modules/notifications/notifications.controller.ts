import { Controller, Get, Patch, Delete, Param, Request, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  findAll(@Request() req: any) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notifService.findAll(req.user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async unreadCount(@Request() req: any) {
    if (!req.user?.id) return { count: 0 };
    const count = await this.notifService.unreadCount(req.user.id);
    return { count };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@Request() req: any) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notifService.markAllRead(req.user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@Param('id') id: string, @Request() req: any) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notifService.markRead(id, req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Dismiss (delete) a notification' })
  dismiss(@Param('id') id: string, @Request() req: any) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notifService.dismiss(id, req.user.id);
  }
}
