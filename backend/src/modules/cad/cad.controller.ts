import {
  Controller, Post, Get, Patch, Param, Body, UploadedFile,
  UseInterceptors, Request, UseGuards, ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { CadService } from './cad.service';
import { MessagesService } from '../messages/messages.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'cad'),
  filename: (_, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + extname(file.originalname));
  },
});

// Post a system message to the order conversation
async function postEvent(
  messagesService: MessagesService,
  orderId: string,
  content: string,
  user: any,
) {
  try {
    await messagesService.postMessage(orderId, { content, isInternal: false }, user);
  } catch { /* never block the main action if messaging fails */ }
}

@ApiTags('CAD')
@ApiBearerAuth()
@Controller('cad')
export class CadController {
  constructor(
    private readonly cadService: CadService,
    private readonly messagesService: MessagesService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get all CAD files (staff only)' })
  getAll() {
    return this.cadService.getAll();
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get CAD files for an order' })
  async getByOrder(@Param('orderId') orderId: string, @Request() req: any) {
    if (req.user?.role === UserRole.CUSTOMER) {
      await this.cadService.assertCustomerOwnsOrder(orderId, req.user.email);
    }
    return this.cadService.getByOrder(orderId);
  }

  @Post('upload/:orderId')
  @Roles(UserRole.ADMIN, UserRole.CAD_DESIGNER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Upload a CAD file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage }))
  async upload(
    @Param('orderId') orderId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('designerNotes') designerNotes: string,
    @Request() req: any,
  ) {
    const cad = await this.cadService.upload(orderId, file, req.user?.email || 'designer', designerNotes);
    const note = designerNotes ? `\n📝 Designer note: "${designerNotes}"` : '';
    await postEvent(
      this.messagesService, orderId,
      `📎 CAD file uploaded — **${file.originalname}** (Rev #${cad.revisionNumber})${note}`,
      req.user,
    );
    return cad;
  }

  @Patch(':id/send')
  @Roles(UserRole.ADMIN, UserRole.CAD_DESIGNER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Send CAD to customer for approval' })
  async send(@Param('id') id: string, @Request() req: any) {
    const cad = await this.cadService.sendForApproval(id);
    await postEvent(
      this.messagesService, cad.orderId,
      `🔔 Design **${cad.originalName}** (Rev #${cad.revisionNumber}) has been sent for your review and approval.`,
      req.user,
    );
    return cad;
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a CAD file (Customer or Admin)' })
  async approve(@Param('id') id: string, @Body('feedback') feedback: string, @Request() req: any) {
    if (req.user?.role === UserRole.CUSTOMER) {
      await this.cadService.assertCustomerOwnsCadFile(id, req.user.email);
    } else if (![UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP].includes(req.user?.role)) {
      throw new ForbiddenException('Not authorized');
    }
    const cad = await this.cadService.approve(id, req.user?.email);
    const note = feedback ? `\n💬 Feedback: "${feedback}"` : '';
    await postEvent(
      this.messagesService, cad.orderId,
      `✅ Design **${cad.originalName}** (Rev #${cad.revisionNumber}) was approved.${note}`,
      req.user,
    );
    return cad;
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a CAD file (Customer or Admin)' })
  async reject(@Param('id') id: string, @Body('feedback') feedback: string, @Request() req: any) {
    if (req.user?.role === UserRole.CUSTOMER) {
      await this.cadService.assertCustomerOwnsCadFile(id, req.user.email);
    } else if (![UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP].includes(req.user?.role)) {
      throw new ForbiddenException('Not authorized');
    }
    const cad = await this.cadService.reject(id, feedback || 'Rejected');
    const note = feedback ? `\n💬 Reason: "${feedback}"` : '';
    await postEvent(
      this.messagesService, cad.orderId,
      `❌ Design **${cad.originalName}** (Rev #${cad.revisionNumber}) was rejected.${note}`,
      req.user,
    );
    return cad;
  }

  @Patch(':id/revision')
  @ApiOperation({ summary: 'Request revision (Customer or Admin)' })
  async revision(@Param('id') id: string, @Body('feedback') feedback: string, @Request() req: any) {
    if (req.user?.role === UserRole.CUSTOMER) {
      await this.cadService.assertCustomerOwnsCadFile(id, req.user.email);
    } else if (![UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP].includes(req.user?.role)) {
      throw new ForbiddenException('Not authorized');
    }
    const cad = await this.cadService.requestRevision(id, feedback || 'Please revise');
    const note = feedback ? `\n💬 Changes requested: "${feedback}"` : '';
    await postEvent(
      this.messagesService, cad.orderId,
      `↺ Revision requested on **${cad.originalName}** (Rev #${cad.revisionNumber}).${note}`,
      req.user,
    );
    return cad;
  }
}
