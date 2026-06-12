import { Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { join } from 'path';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

import { Order } from './database/entities/order.entity';
import { User } from './database/entities/user.entity';
import { CadFile } from './database/entities/cad-file.entity';
import { Sku } from './database/entities/sku.entity';
import { Notification } from './database/entities/notification.entity';
import { OrderMessage } from './database/entities/order-message.entity';

import { OrdersModule } from './modules/orders/orders.module';
import { AuthModule } from './modules/auth/auth.module';
import { PublicModule } from './modules/public/public.module';
import { CadModule } from './modules/cad/cad.module';
import { SkuModule } from './modules/sku/sku.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { UsersModule } from './modules/users/users.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ImportModule } from './modules/import/import.module';
import { SlaModule } from './modules/sla/sla.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { EmailModule } from './modules/email/email.module';
import { SmartsheetModule } from './modules/smartsheet/smartsheet.module';
import { TodosModule } from './modules/todos/todos.module';
import { Todo } from './database/entities/todo.entity';
import { AuthService } from './modules/auth/auth.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{
      name: 'default',
      ttl: 60000,
      limit: 300,
    }]),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        const entities = [Order, User, CadFile, Sku, Notification, OrderMessage, Todo];
        if (databaseUrl) {
          return { type: 'postgres', url: databaseUrl, ssl: isProduction ? { rejectUnauthorized: false } : false, entities, synchronize: true, logging: false };
        }
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST') || 'localhost',
          port: config.get<number>('DB_PORT') || 5432,
          username: config.get<string>('DB_USERNAME') || 'jewelflow',
          password: config.get<string>('DB_PASSWORD') || 'jewelflow123',
          database: config.get<string>('DB_NAME') || 'jewelflow',
          entities,
          synchronize: true,
          logging: false,
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    PublicModule,
    OrdersModule,
    CadModule,
    SkuModule,
    NotificationsModule,
    ManufacturingModule,
    ShippingModule,
    UsersModule,
    MessagesModule,
    ImportModule,
    SlaModule,
    ReportingModule,
    EmailModule,
    SmartsheetModule,
    TodosModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly authService: AuthService) {}
  async onModuleInit() {
    await this.authService.seedAdmin();
  }
}
