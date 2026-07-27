import { Body, Controller, Get, Patch, Delete, Post, Param, Request, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { NotificationsService } from './notifications.service';

class UpdatePreferencesDto {
  @IsBoolean() @IsOptional() emailNotificationsEnabled?: boolean;
  @IsBoolean() @IsOptional() notifyPriorityOnly?: boolean;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  findAll(@Request() req: any) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notifService.findAll(req.user.id, req.user.role);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async unreadCount(@Request() req: any) {
    if (!req.user?.id) return { count: 0 };
    const count = await this.notifService.unreadCount(req.user.id, req.user.role);
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

  @Get('preferences')
  @ApiOperation({ summary: "Get the current user's own notification preferences" })
  getPreferences(@Request() req: any) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notifService.getPreferences(req.user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: "Update the current user's own notification preferences" })
  updatePreferences(@Body() dto: UpdatePreferencesDto, @Request() req: any) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notifService.updatePreferences(req.user.id, dto);
  }

  @Post('mute/:orderId')
  @ApiOperation({ summary: 'Mute bell notifications for one order (current user only)' })
  muteOrder(@Param('orderId') orderId: string, @Request() req: any) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notifService.muteOrder(req.user.id, orderId);
  }

  @Delete('mute/:orderId')
  @ApiOperation({ summary: 'Unmute bell notifications for one order (current user only)' })
  unmuteOrder(@Param('orderId') orderId: string, @Request() req: any) {
    if (!req.user?.id) throw new UnauthorizedException();
    return this.notifService.unmuteOrder(req.user.id, orderId);
  }
}
