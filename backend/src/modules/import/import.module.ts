import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { join } from 'path';
import { Order } from '../../database/entities/order.entity';
import { CadModule } from '../cad/cad.module';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    CadModule,
    MulterModule.register({ dest: join(process.cwd(), 'uploads', 'imports') }),
  ],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
