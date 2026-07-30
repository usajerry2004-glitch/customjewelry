import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerCode } from '../../database/entities/customer-code.entity';
import { CustomerCodesService } from './customer-codes.service';
import { CustomerCodesController } from './customer-codes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerCode])],
  controllers: [CustomerCodesController],
  providers: [CustomerCodesService],
})
export class CustomerCodesModule {}
