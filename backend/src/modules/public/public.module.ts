import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { CadFile } from '../../database/entities/cad-file.entity';
import { Notification } from '../../database/entities/notification.entity';
import { PublicOrdersController } from './public-orders.controller';
import { PublicOrdersService } from './public-orders.service';
import { SpacesService } from '../spaces/spaces.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, User, CadFile, Notification]),
    MulterModule.registerAsync({
      inject: [SpacesService],
      useFactory: (spaces: SpacesService) => ({
        storage: spaces.getMulterStorage('customer-uploads'),
        limits:  { fileSize: 200 * 1024 * 1024, files: 10 },
      }),
    }),
  ],
  controllers: [PublicOrdersController],
  providers: [PublicOrdersService],
})
export class PublicModule {}
