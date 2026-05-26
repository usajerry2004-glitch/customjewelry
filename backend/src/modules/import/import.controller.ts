import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { ImportService } from './import.service';

class ImportDto {
  @IsString()
  filePath: string;
}

@ApiTags('Import')
@ApiBearerAuth()
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('smartsheet')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Import orders from Smartsheet Excel export (Admin only)' })
  importSmartsheet(@Body() dto: ImportDto) {
    return this.importService.importFromExcel(dto.filePath);
  }
}
