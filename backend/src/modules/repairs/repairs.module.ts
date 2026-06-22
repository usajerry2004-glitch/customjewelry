import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { RepairsService } from './repairs.service';
import { RepairsController } from './repairs.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User]), NotificationsModule],
  providers: [RepairsService],
  controllers: [RepairsController],
  exports: [RepairsService],
})
export class RepairsModule {}
