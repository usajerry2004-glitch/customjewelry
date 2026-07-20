import { Controller, Get, Post, Body, Param, Request, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
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
    @Request() req: any,
  ) {
    const dto: CreateMessageDto = {
      content,
      isInternal: isInternal === 'true',
      mentions: mentions ? JSON.parse(mentions) : [],
    };
    return this.messagesService.postMessage(orderId, dto, req.user, file);
  }
}
