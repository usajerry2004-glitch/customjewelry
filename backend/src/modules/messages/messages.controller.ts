import { Controller, Get, Post, Patch, Body, Param, Query, Request, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
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

  @Get('reads')
  @ApiOperation({ summary: "Who has read this order's conversation, and when (for \"seen by\")" })
  getReads(@Param('orderId') orderId: string) {
    return this.messagesService.getReads(orderId);
  }

  @Patch('read')
  @ApiOperation({ summary: "Mark this order's conversation as read by the current user" })
  markRead(@Param('orderId') orderId: string, @Request() req: any) {
    return this.messagesService.markRead(orderId, req.user);
  }

  @Post()
  @ApiOperation({ summary: 'Post a message on an order, optionally with a file attachment (any type, up to 50MB)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  postMessage(
    @Param('orderId') orderId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('content') content: string,
    @Body('isInternal') isInternal: string,
    @Body('mentions') mentions: string,
    @Body('parentMessageId') parentMessageId: string,
    @Request() req: any,
  ) {
    const dto: CreateMessageDto = {
      content,
      isInternal: isInternal === 'true',
      mentions: mentions ? JSON.parse(mentions) : [],
      parentMessageId: parentMessageId || undefined,
    };
    return this.messagesService.postMessage(orderId, dto, req.user, file);
  }
}

// Separate top-level controller (rather than a method on the one above) so
// this doesn't have to live under a specific :orderId — it searches across
// every order this user can see.
@ApiTags('Messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesSearchController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('search')
  @ApiOperation({ summary: 'Keyword search across chat messages, scoped to orders the current user can see' })
  search(@Query('q') q: string, @Request() req: any) {
    return this.messagesService.searchMessages(q, req.user);
  }
}
