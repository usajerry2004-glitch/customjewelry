import {
  Controller, Post, Get, Patch, Param, Body, UploadedFile, UploadedFiles,
  UseInterceptors, Request, UseGuards, ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { CadService } from './cad.service';
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

@ApiTags('CAD')
@ApiBearerAuth()
@Controller('cad')
export class CadController {
  constructor(private readonly cadService: CadService) {}

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
    const cads = await this.cadService.getByOrder(orderId);
    if (req.user?.role === UserRole.CUSTOMER) {
      return cads.filter(c => !c.originalName.toLowerCase().endsWith('.3dm'));
    }
    return cads;
  }

  @Post('reference/:orderId')
  @ApiOperation({ summary: 'Upload a reference image for an order (all staff)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage }))
  async uploadReference(
    @Param('orderId') orderId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.cadService.uploadReference(orderId, file, req.user?.email || 'staff');
  }

  @Post('upload/:orderId')
  @Roles(UserRole.CAD_DESIGNER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Upload CAD files (CAD Designer only) — supports multiple files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 20, { storage }))
  async upload(
    @Param('orderId') orderId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('designerNotes') designerNotes: string,
    @Request() req: any,
  ) {
    const results = [];
    for (const file of files) {
      const cad = await this.cadService.upload(orderId, file, req.user?.email || 'designer', designerNotes);
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
