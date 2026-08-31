import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { Order } from '../../database/entities/order.entity';
import { Company } from '../../database/entities/company.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Order, Company]), CatalogModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
