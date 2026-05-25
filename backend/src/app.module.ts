import { Module, OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

import { Order } from './database/entities/order.entity';
import { User } from './database/entities/user.entity';
import { CadFile } from './database/entities/cad-file.entity';
import { Sku } from './database/entities/sku.entity';
import { Notification } from './database/entities/notification.entity';

import { OrdersModule } from './modules/orders/orders.module';
import { AuthModule } from './modules/auth/auth.module';
import { CadModule } from './modules/cad/cad.module';
import { SkuModule } from './modules/sku/sku.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { AuthService } from './modules/auth/auth.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'jewelflow'),
        password: config.get('DB_PASSWORD', 'jewelflow123'),
        database: config.get('DB_NAME', 'jewelflow'),
        entities: [Order, User, CadFile, Sku, Notification],
        synchronize: true,
        logging: false,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    OrdersModule,
    CadModule,
    SkuModule,
    NotificationsModule,
    ManufacturingModule,
    ShippingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly authService: AuthService) {}
  async onModuleInit() {
    await this.authService.seedAdmin();
  }
}
