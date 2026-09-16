import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HSTS_HEADER, SECURITY_HEADERS } from './common/security-headers';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  // /health stays outside the version prefix so platform health checks have a stable
  // address that never moves with an API version.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // Before anything else, so a response produced by an error filter carries them too.
  const production = config.get<string>('NODE_ENV') === 'production';
  app.use(
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        response.setHeader(name, value);
      }
      if (production) response.setHeader('Strict-Transport-Security', HSTS_HEADER);
      next();
    },
  );

  // Express announces itself by default, which tells an attacker what to look up.
  app.getHttpAdapter().getInstance().disable?.('x-powered-by');

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
