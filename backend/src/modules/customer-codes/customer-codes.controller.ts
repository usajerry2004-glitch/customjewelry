import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CustomerCodesService } from './customer-codes.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

@ApiTags('Customer Codes')
@ApiBearerAuth()
@Controller('customer-codes')
export class CustomerCodesController {
  constructor(private readonly svc: CustomerCodesService) {}

  @Get()
  @ApiOperation({ summary: 'List RightClick customer code/name pairs, for the quote customer-code dropdown' })
  findAll() {
    return this.svc.findAll();
  }

  @Post('import')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Re-run the bundled RightClick CSV import in place (idempotent upsert on code) — for environments with no shell access' })
  importCsv() {
    return this.svc.importFromCsv();
  }
}
