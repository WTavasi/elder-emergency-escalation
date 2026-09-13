import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  // /health stays outside the version prefix so platform health checks have a stable
  // address that never moves with an API version.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.enableCors({
    origin: [config.getOrThrow<string>('ADMIN_ORIGIN')],
    credentials: true,
  });

  // Runs onModuleDestroy on SIGTERM, so Prisma and Redis close cleanly when Render
  // recycles the instance rather than leaving escalation timers on a dead connection.
  app.enableShutdownHooks();

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}/api/v1, health at /health`);
}

void bootstrap().catch((error: unknown) => {
  // Configuration failures land here, before the Nest logger exists.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
