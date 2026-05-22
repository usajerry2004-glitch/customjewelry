import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sku } from '../../database/entities/sku.entity';
import { Order } from '../../database/entities/order.entity';
import { SkuService } from './sku.service';
import { SkuController } from './sku.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Sku, Order])],
  controllers: [SkuController],
  providers: [SkuService],
  exports: [SkuService],
})
export class SkuModule {}
