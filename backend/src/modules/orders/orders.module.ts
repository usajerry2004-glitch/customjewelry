import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { Notification } from '../../database/entities/notification.entity';
import { CadFile } from '../../database/entities/cad-file.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { Sku } from '../../database/entities/sku.entity';
import { Company } from '../../database/entities/company.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { SkuModule } from '../sku/sku.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User, Notification, CadFile, OrderEvent, OrderMessage, Sku, Company]), SkuModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
