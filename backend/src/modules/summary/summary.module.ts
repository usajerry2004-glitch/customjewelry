import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { SummaryService } from './summary.service';
import { SummaryController } from './summary.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  controllers: [SummaryController],
  providers: [SummaryService],
})
export class SummaryModule {}
