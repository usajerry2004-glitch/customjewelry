import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { extname } from 'path';
import { CadFile } from '../../database/entities/cad-file.entity';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { Notification } from '../../database/entities/notification.entity';
import { CadService } from './cad.service';
import { CadController } from './cad.controller';
import { SpacesService } from '../spaces/spaces.service';
import { SkuModule } from '../sku/sku.module';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-ms-wmv',
  'application/octet-stream', 'model/vnd.3dm', 'application/rhino',
]);
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf',
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.wmv',
  '.3dm', '.jcd', '.obj', '.stl', '.dxf', '.step', '.stp',
]);

@Module({
  imports: [
    TypeOrmModule.forFeature([CadFile, Order, User, Notification]),
    SkuModule,
    MulterModule.registerAsync({
      inject: [SpacesService],
      useFactory: (spaces: SpacesService) => ({
        storage:    spaces.getMulterStorage('cad'),
        limits:     { fileSize: 50 * 1024 * 1024 },
        fileFilter: (_: any, file: Express.Multer.File, cb: any) => {
          const ext = extname(file.originalname).toLowerCase();
          if (ALLOWED_EXTENSIONS.has(ext) || ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
          cb(new Error(`File type not allowed: ${ext || file.mimetype}`), false);
        },
      }),
    }),
  ],
  controllers: [CadController],
  providers: [CadService],
  exports: [CadService],
})
export class CadModule {}
