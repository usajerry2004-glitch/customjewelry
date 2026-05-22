import {
  Controller, Post, Get, Patch, Param, Body, UploadedFile,
  UseInterceptors, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiTags, ApiOperation, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { CadService } from './cad.service';
import { Public } from '../../common/decorators/public.decorator';

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

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all CAD files' })
  getAll() {
    return this.cadService.getAll();
  }

  @Public()
  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get CAD files for an order' })
  getByOrder(@Param('orderId') orderId: string) {
    return this.cadService.getByOrder(orderId);
  }

  @Public()
  @Post('upload/:orderId')
  @ApiOperation({ summary: 'Upload a CAD file for an order' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage }))
  upload(
    @Param('orderId') orderId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('designerNotes') designerNotes: string,
    @Request() req: any,
  ) {
    const uploadedBy = req.user?.email || 'designer@kirajewels.one';
    return this.cadService.upload(orderId, file, uploadedBy, designerNotes);
  }

  @Public()
  @Patch(':id/send')
  @ApiOperation({ summary: 'Send CAD file to customer for approval' })
  send(@Param('id') id: string) {
    return this.cadService.sendForApproval(id);
  }

  @Public()
  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a CAD file' })
  approve(@Param('id') id: string, @Request() req: any) {
    const by = req.user?.email || 'customer@example.com';
    return this.cadService.approve(id, by);
  }

  @Public()
  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a CAD file' })
  reject(@Param('id') id: string, @Body('feedback') feedback: string) {
    return this.cadService.reject(id, feedback || 'Rejected');
  }

  @Public()
  @Patch(':id/revision')
  @ApiOperation({ summary: 'Request a revision on a CAD file' })
  revision(@Param('id') id: string, @Body('feedback') feedback: string) {
    return this.cadService.requestRevision(id, feedback || 'Please revise');
  }
}
