import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
