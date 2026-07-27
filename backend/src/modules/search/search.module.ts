import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { Company } from '../../database/entities/company.entity';
import { OrdersModule } from '../orders/orders.module';
import { MessagesModule } from '../messages/messages.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Company]), OrdersModule, MessagesModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
