import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { Notification } from '../../database/entities/notification.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { EmailReply } from '../../database/entities/email-reply.entity';
import { PublicModule } from '../public/public.module';
import { EmailRepliesService } from './email-replies.service';
import { EmailRepliesController } from './email-replies.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, User, Notification, OrderEvent, EmailReply]),
    PublicModule,
  ],
  controllers: [EmailRepliesController],
  providers: [EmailRepliesService],
})
export class EmailRepliesModule {}
