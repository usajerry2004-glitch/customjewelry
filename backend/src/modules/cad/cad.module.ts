import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { join } from 'path';
import { CadFile } from '../../database/entities/cad-file.entity';
import { Order } from '../../database/entities/order.entity';
import { CadService } from './cad.service';
import { CadController } from './cad.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CadFile, Order]),
    MulterModule.register({ dest: join(process.cwd(), 'uploads', 'cad') }),
  ],
  controllers: [CadController],
  providers: [CadService],
  exports: [CadService],
})
export class CadModule {}
