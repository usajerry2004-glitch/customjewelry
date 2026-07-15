import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CadFile } from '../../database/entities/cad-file.entity';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { Notification } from '../../database/entities/notification.entity';
import { CadTimeLog } from '../../database/entities/cad-time-log.entity';
import { CadService } from './cad.service';
import { CadController } from './cad.controller';
import { SkuModule } from '../sku/sku.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CadFile, Order, User, Notification, CadTimeLog]),
    SkuModule,
    // Memory storage (not direct-to-S3 streaming) so the service layer has
    // the file buffer available to derive an image thumbnail before upload.
    MulterModule.register({
      storage: memoryStorage(),
      limits:  { fileSize: 200 * 1024 * 1024 },
    }),
  ],
  controllers: [CadController],
  providers: [CadService],
  exports: [CadService],
})
export class CadModule {}
