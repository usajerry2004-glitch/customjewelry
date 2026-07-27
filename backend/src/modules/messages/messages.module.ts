import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { OrderConversationRead } from '../../database/entities/order-conversation-read.entity';
import { User } from '../../database/entities/user.entity';
import { Order } from '../../database/entities/order.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { MessagesService } from './messages.service';
import { MessagesController, MessagesSearchController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderMessage, OrderConversationRead, User, Order]),
    NotificationsModule,
    AuthModule,
    OrdersModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits:  { fileSize: 50 * 1024 * 1024 },
    }),
  ],
  controllers: [MessagesController, MessagesSearchController],
  providers: [MessagesService, MessagesGateway],
  exports: [MessagesService],
})
export class MessagesModule {}
