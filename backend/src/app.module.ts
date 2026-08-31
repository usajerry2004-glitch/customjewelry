import { Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

import { Order } from './database/entities/order.entity';
import { User } from './database/entities/user.entity';
import { CadFile } from './database/entities/cad-file.entity';
import { Sku } from './database/entities/sku.entity';
import { Notification } from './database/entities/notification.entity';
import { OrderMessage } from './database/entities/order-message.entity';
import { OrderEvent } from './database/entities/order-event.entity';
import { CadTimeLog } from './database/entities/cad-time-log.entity';
import { Company } from './database/entities/company.entity';
import { OrderConversationRead } from './database/entities/order-conversation-read.entity';
import { MutedOrderNotification } from './database/entities/muted-order-notification.entity';
import { CustomerCode } from './database/entities/customer-code.entity';
import { CatalogItem } from './database/entities/catalog-item.entity';

import { OrdersModule } from './modules/orders/orders.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { AuthModule } from './modules/auth/auth.module';
import { PublicModule } from './modules/public/public.module';
import { CadModule } from './modules/cad/cad.module';
import { SkuModule } from './modules/sku/sku.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { UsersModule } from './modules/users/users.module';
import { MessagesModule } from './modules/messages/messages.module';
import { ImportModule } from './modules/import/import.module';
import { EmailModule } from './modules/email/email.module';
import { TodosModule } from './modules/todos/todos.module';
import { RepairsModule } from './modules/repairs/repairs.module';
import { SpacesModule } from './modules/spaces/spaces.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SearchModule } from './modules/search/search.module';
import { CustomerCodesModule } from './modules/customer-codes/customer-codes.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { Todo } from './database/entities/todo.entity';
import { AuthService } from './modules/auth/auth.service';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{
      name: 'default',
      ttl: 60000,
      limit: 300,
    }]),
    ScheduleModule.forRoot(),
    SpacesModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        const entities = [
          Order, User, CadFile, Sku, Notification, OrderMessage, Todo, OrderEvent, CadTimeLog, Company,
          // Missing from this list meant `synchronize: true` never created
          // their tables at all — every read-receipt ("Seen by") and mute
          // lookup/write against them threw "relation does not exist",
          // masked as a generic 500 with no indication it was schema, not
          // data or logic.
          OrderConversationRead, MutedOrderNotification, CustomerCode, CatalogItem,
        ];
        const pool = { extra: { max: 20, min: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 } };
        if (databaseUrl) {
          return { type: 'postgres', url: databaseUrl, ssl: isProduction ? { rejectUnauthorized: false } : false, entities, synchronize: true, logging: false, ...pool };
        }
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST') || 'localhost',
          port: config.get<number>('DB_PORT') || 5432,
          username: config.get<string>('DB_USERNAME') || 'jewelflow',
          password: config.get<string>('DB_PASSWORD') || 'jewelflow123',
          database: config.get<string>('DB_NAME') || 'jewelflow',
          ssl: isProduction ? { rejectUnauthorized: false } : false,
          entities,
          synchronize: true,
          logging: false,
          ...pool,
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
    UsersModule,
    MessagesModule,
    ImportModule,
    EmailModule,
    TodosModule,
    RepairsModule,
    ReportsModule,
    SearchModule,
    CustomerCodesModule,
    CompaniesModule,
    CatalogModule,
  ],
  controllers: [HealthController],
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
