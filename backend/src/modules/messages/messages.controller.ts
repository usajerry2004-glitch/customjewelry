import { Controller, Get, Post, Body, Param, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MessagesService, CreateMessageDto } from './messages.service';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('orders/:orderId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'Get messages for an order' })
  getMessages(@Param('orderId') orderId: string, @Request() req: any) {
    return this.messagesService.getMessages(orderId, req.user?.role);
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
