import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { Notification } from '../../database/entities/notification.entity';
import { SlaService } from './sla.service';
import { SlaController } from './sla.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User, Notification])],
  controllers: [SlaController],
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}
