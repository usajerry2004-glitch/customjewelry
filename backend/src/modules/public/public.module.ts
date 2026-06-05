import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { CadFile } from '../../database/entities/cad-file.entity';
import { Notification } from '../../database/entities/notification.entity';
import { PublicOrdersController } from './public-orders.controller';
import { PublicOrdersService } from './public-orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User, CadFile, Notification])],
  controllers: [PublicOrdersController],
  providers: [PublicOrdersService],
})
export class PublicModule {}
