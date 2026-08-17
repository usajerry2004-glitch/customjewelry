import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { Company } from '../../database/entities/company.entity';
import { CadFile } from '../../database/entities/cad-file.entity';
import { Notification } from '../../database/entities/notification.entity';
import { PublicOrdersController } from './public-orders.controller';
import { PublicOrdersService } from './public-orders.service';
import { RingBuilderOrdersController } from './ring-builder-orders.controller';
import { RingBuilderOrdersService } from './ring-builder-orders.service';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, User, Company, CadFile, Notification]),
    OrdersModule,
    // Memory storage so the service layer can derive an image thumbnail
    // before uploading the original to Spaces.
    MulterModule.register({
      storage: memoryStorage(),
      limits:  { fileSize: 200 * 1024 * 1024, files: 10 },
    }),
  ],
  controllers: [PublicOrdersController, RingBuilderOrdersController],
  providers: [PublicOrdersService, RingBuilderOrdersService],
})
export class PublicModule {}
