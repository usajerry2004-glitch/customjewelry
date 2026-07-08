import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sku } from '../../database/entities/sku.entity';
import { Order } from '../../database/entities/order.entity';
import { SkuService } from './sku.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sku, Order])],
  providers: [SkuService],
  exports: [SkuService],
})
export class SkuModule {}
