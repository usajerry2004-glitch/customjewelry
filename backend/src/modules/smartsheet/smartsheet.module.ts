import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { CadFile } from '../../database/entities/cad-file.entity';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { SmartsheetService } from './smartsheet.service';
import { SmartsheetController } from './smartsheet.controller';
import { SmartsheetImportService } from './smartsheet-import.service';
import { SmartsheetWebhookService } from './smartsheet-webhook.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, User, CadFile, OrderMessage])],
  controllers: [SmartsheetController],
  providers: [SmartsheetService, SmartsheetImportService, SmartsheetWebhookService],
  exports: [SmartsheetService, SmartsheetImportService, SmartsheetWebhookService],
})
export class SmartsheetModule {}
