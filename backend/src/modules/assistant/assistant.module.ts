import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [OrdersModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
