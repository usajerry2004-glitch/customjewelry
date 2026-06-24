import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { extname } from 'path';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { CadFile } from '../../database/entities/cad-file.entity';
import { Notification } from '../../database/entities/notification.entity';
import { PublicOrdersController } from './public-orders.controller';
import { PublicOrdersService } from './public-orders.service';
import { SpacesService } from '../spaces/spaces.service';

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.pdf', '.3dm', '.dwg', '.dxf', '.obj', '.stl',
]);

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, User, CadFile, Notification]),
    MulterModule.registerAsync({
      inject: [SpacesService],
      useFactory: (spaces: SpacesService) => ({
        storage: spaces.getMulterStorage('customer-uploads'),
        limits: { fileSize: 10 * 1024 * 1024, files: 3 },
        fileFilter: (_: any, file: Express.Multer.File, cb: any) => {
          const ext = extname(file.originalname).toLowerCase();
          if (ALLOWED_EXTENSIONS.has(ext)) return cb(null, true);
          cb(new Error(`File type not allowed: ${ext}`), false);
        },
      }),
    }),
  ],
  controllers: [PublicOrdersController],
  providers: [PublicOrdersService],
})
export class PublicModule {}
