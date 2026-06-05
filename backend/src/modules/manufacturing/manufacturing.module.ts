import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { ManufacturingService } from './manufacturing.service';
import { ManufacturingController } from './manufacturing.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User]), NotificationsModule],
  providers: [ManufacturingService],
  controllers: [ManufacturingController],
  exports: [ManufacturingService],
})
export class ManufacturingModule {}
