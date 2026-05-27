import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Security
  app.use(helmet());
  app.enableCors({
    origin: true,
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

  app.setGlobalPrefix('api/v1');

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('JewelFlow OS API')
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
    .addTag('Reporting', 'Analytics and metrics')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`JewelFlow OS API running at: http://localhost:${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
