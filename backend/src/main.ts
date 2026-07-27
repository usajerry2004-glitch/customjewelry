import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as compression from 'compression';
import * as Sentry from '@sentry/node';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // Initialise Sentry before the app boots so all errors are captured from startup
  const sentryDsn = process.env.SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV || 'development',
    });
  }

  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = new Logger('Bootstrap');

  // The order-chat gateway (typing indicators, live messages, read receipts)
  // rides on the same HTTP server as the REST API via socket.io.
  app.useWebSocketAdapter(new IoAdapter(app));

  // Security
  app.use(helmet());
  app.use(compression());
  const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter — logs 5xx to console and ships them to Sentry
  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api/v1');

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Kira Custom Jewelry API')
    .setDescription('Custom Jewelry Workflow Management Platform — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Orders', 'Order management')
    .addTag('CAD', 'CAD file management')
    .addTag('SKU', 'SKU generation and catalog')
    .addTag('Inventory', 'Stone and metal inventory')
    .addTag('Manufacturing', 'India factory workflow')
    .addTag('Shipping', 'Shipment tracking')
    .addTag('Repairs', 'US setter repair workflow')
    .addTag('Customers', 'Customer management')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`Kira Custom Jewelry API running at: http://localhost:${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
