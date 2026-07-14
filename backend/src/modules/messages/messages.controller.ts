import { Controller, Get, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MessagesService, CreateMessageDto } from './messages.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('orders/:orderId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'Get messages for an order' })
  getMessages(@Param('orderId') orderId: string, @Request() req: any) {
    return this.messagesService.getMessages(orderId, req.user);
  }

  @Get('mentionable-users')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP, UserRole.CAD_DESIGNER, UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get the people who can be @mentioned on this order' })
  getMentionableUsers(@Param('orderId') orderId: string) {
    return this.messagesService.getMentionableUsers(orderId);
  }

  @Post()
  @ApiOperation({ summary: 'Post a message on an order' })
  postMessage(
    @Param('orderId') orderId: string,
    @Body() dto: CreateMessageDto,
    @Request() req: any,
  ) {
    return this.messagesService.postMessage(orderId, dto, req.user);
  }
}
