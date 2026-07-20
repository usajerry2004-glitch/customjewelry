import { Controller, Post, Get, UploadedFiles, UseInterceptors, UseGuards, Query, Body } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { ImportService } from './import.service';

const storage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'imports'),
  filename: (_, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + extname(file.originalname));
  },
});

@ApiTags('Import')
@ApiBearerAuth()
@Controller('import')
@Roles(UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP)
@UseGuards(RolesGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload CSV or Excel file and import orders, with an optional ZIP of reference photos and customer-identity overrides applied to every row. Use ?preview=true to preview without saving.' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'images', maxCount: 1 }], { storage }))
  async upload(
    @UploadedFiles() files: { file?: Express.Multer.File[]; images?: Express.Multer.File[] },
    @Query('preview') preview: string,
    @Body('customerFullName') customerFullName: string,
    @Body('customerEmail') customerEmail: string,
    @Body('storeName') storeName: string,
  ) {
    const file = files?.file?.[0];
    if (!file) return { error: 'No file uploaded' };
    const isPreview = preview === 'true';
    return this.importService.importFromFile(file.path, isPreview, {
      overrides: { customerFullName, customerEmail, storeName },
      imagesZipPath: files?.images?.[0]?.path,
    });
  }

  @Get('template')
  @ApiOperation({ summary: 'Download CSV template with correct column headers' })
  getTemplate() {
    return {
      filename: 'kira-jewels-order-import-template.csv',
      headers: [
        'PO #', 'Store Name', 'Customer Full Name', 'Email',
        'Type', 'Metal Type', 'Metal Color', 'Size',
        'Natural or Lab', 'Dia Quality', 'Center Stone Shape', 'Approximate Carat Weight',
        'Status', 'Kira Sku #', 'Tracking', 'Kira Quoted Cost',
        'Sales Rep Email', 'Customer Comments', 'Ship Method', 'Vendor Name',
        'Invoice #', 'Head Style', 'Shank Style', 'Time Frame',
      ],
      example: {
        'PO #': 'KJ-2026-001',
        'Store Name': 'Diamond NYC',
        'Customer Full Name': 'Jane Smith',
        'Email': 'jane@example.com',
        'Type': 'Engagement Ring',
        'Metal Type': '18K',
        'Metal Color': 'White Gold',
        'Size': '6.5',
        'Natural or Lab': 'Certified Lab Grown Diamond',
        'Dia Quality': 'VS1',
        'Center Stone Shape': 'Round',
        'Approximate Carat Weight': '1.25',
        'Status': 'Waiting Confirmation',
        'Kira Quoted Cost': '3500',
      },
    };
  }
}
