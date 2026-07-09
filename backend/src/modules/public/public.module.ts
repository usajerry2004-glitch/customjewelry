import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { CadFile } from '../../database/entities/cad-file.entity';
import { Notification } from '../../database/entities/notification.entity';
import { PublicOrdersController } from './public-orders.controller';
import { PublicOrdersService } from './public-orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, User, CadFile, Notification]),
    // Memory storage so the service layer can derive an image thumbnail
    // before uploading the original to Spaces.
    MulterModule.register({
      storage: memoryStorage(),
      limits:  { fileSize: 200 * 1024 * 1024, files: 10 },
    }),
  ],
  controllers: [PublicOrdersController],
  providers: [PublicOrdersService],
})
export class PublicModule {}
