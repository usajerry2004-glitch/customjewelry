import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CustomerCodesService } from './customer-codes.service';

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
}
