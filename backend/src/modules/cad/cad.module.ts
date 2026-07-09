import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { CadFile } from '../../database/entities/cad-file.entity';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { Notification } from '../../database/entities/notification.entity';
import { CadService } from './cad.service';
import { CadController } from './cad.controller';
import { SpacesService } from '../spaces/spaces.service';
import { SkuModule } from '../sku/sku.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CadFile, Order, User, Notification]),
    SkuModule,
    MulterModule.registerAsync({
      inject: [SpacesService],
      useFactory: (spaces: SpacesService) => ({
        storage: spaces.getMulterStorage('cad'),
        limits:  { fileSize: 200 * 1024 * 1024 },
      }),
    }),
  ],
  controllers: [CadController],
  providers: [CadService],
  exports: [CadService],
})
export class CadModule {}
