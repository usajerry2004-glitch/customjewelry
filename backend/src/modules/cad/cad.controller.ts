import {
  Controller, Post, Get, Patch, Delete, Param, Query, Body, UploadedFile, UploadedFiles,
  UseInterceptors, Request, UseGuards, ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CadService } from './cad.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

@ApiTags('CAD')
@ApiBearerAuth()
@Controller('cad')
export class CadController {
  constructor(private readonly cadService: CadService) {}

  @Get('status-counts')
  @ApiOperation({ summary: 'Count of CAD files by status for CAD_IN_PROGRESS orders' })
  async getStatusCounts() {
    return this.cadService.getStatusCounts();
  }

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
      const cads = await this.cadService.getByOrder(orderId);
      const visible = await this.cadService.isVisibleToCustomer(orderId);
      if (!visible) {
        // Before CAD is sent, customers can still see their reference images
        return cads.filter(c =>
          c.designerNotes === 'Reference image' || c.designerNotes === 'Customer reference image'
        );
      }
      return cads;
    }
    const cads = await this.cadService.getByOrder(orderId);
    return cads;
  }

  @Patch('order/:orderId/send-to-customer')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Send CAD files to customer for approval (Admin/Authorizer only)' })
  async sendToCustomer(@Param('orderId') orderId: string) {
    await this.cadService.sendToCustomer(orderId);
    return { sent: true };
  }

  @Get('thumbnails')
  @ApiOperation({ summary: 'Get first reference image filename for a batch of orders' })
  @ApiQuery({ name: 'orderIds', required: true, description: 'Comma-separated order IDs' })
  async getThumbnails(@Query('orderIds') orderIds: string) {
    const ids = (orderIds || '').split(',').map(s => s.trim()).filter(Boolean);
    return this.cadService.getThumbnails(ids);
  }

  @Post('reference/:orderId')
  @ApiOperation({ summary: 'Upload a reference image for an order (all staff)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReference(
    @Param('orderId') orderId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.cadService.uploadReference(orderId, file, req.user?.email || 'staff');
  }

  @Post('upload/:orderId')
  @Roles(UserRole.CAD_DESIGNER, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Upload CAD files (CAD Designer or Admin) — supports multiple files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 20))
  async upload(
    @Param('orderId') orderId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('designerNotes') designerNotes: string,
    @Body('cadPersonName') cadPersonName: string,
    @Body('verifiedByName') verifiedByName: string,
    @Request() req: any,
  ) {
    const results = [];
    for (const file of files) {
      const cad = await this.cadService.upload(orderId, file, req.user?.email || 'designer', designerNotes, cadPersonName, verifiedByName);
      results.push(cad);
    }
    // Single notification for the whole batch
    if (results.length > 0) await this.cadService.notifyBatchUploaded(orderId);
    return results;
  }

  @Patch(':id/send')
  @Roles(UserRole.ADMIN, UserRole.CAD_DESIGNER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Send CAD to customer for approval' })
  async send(@Param('id') id: string) {
    return this.cadService.sendForApproval(id);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a CAD file (Customer or Admin)' })
  async approve(@Param('id') id: string, @Body('feedback') feedback: string, @Request() req: any) {
    if (req.user?.role === UserRole.CUSTOMER) {
      await this.cadService.assertCustomerOwnsCadFile(id, req.user.email);
    } else if (![UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP].includes(req.user?.role)) {
      throw new ForbiddenException('Not authorized');
    }
    return this.cadService.approve(id, req.user?.email);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a CAD file (Customer or Admin)' })
  async reject(@Param('id') id: string, @Body('feedback') feedback: string, @Request() req: any) {
    if (req.user?.role === UserRole.CUSTOMER) {
      await this.cadService.assertCustomerOwnsCadFile(id, req.user.email);
    } else if (![UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP].includes(req.user?.role)) {
      throw new ForbiddenException('Not authorized');
    }
    return this.cadService.reject(id, feedback || 'Rejected');
  }

  @Delete(':id')
  @Roles(UserRole.CAD_DESIGNER, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Delete a CAD file (CAD Designer or Admin, only if not yet approved/rejected)' })
  async deleteFile(@Param('id') id: string) {
    await this.cadService.deleteFile(id);
    return { deleted: true };
  }

  @Patch(':id/revision')
  @ApiOperation({ summary: 'Request revision (Customer or Admin)' })
  async revision(@Param('id') id: string, @Body('feedback') feedback: string, @Request() req: any) {
    if (req.user?.role === UserRole.CUSTOMER) {
      await this.cadService.assertCustomerOwnsCadFile(id, req.user.email);
    } else if (![UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP].includes(req.user?.role)) {
      throw new ForbiddenException('Not authorized');
    }
    return this.cadService.requestRevision(id, feedback || 'Please revise');
  }
}
