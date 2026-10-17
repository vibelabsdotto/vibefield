import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { AppModule } from './app.module';
import { config } from './config';
import { localSecurity } from './security';
import { ErrorFilter } from './errors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger: ['error', 'warn', 'log'] });
  app.disable('x-powered-by'); app.set('trust proxy', false);
  app.use(localSecurity); app.use(json({ limit: '2mb', strict: true }));
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ErrorFilter()); app.enableShutdownHooks();
  await app.listen(config.port, '127.0.0.1'); console.log(`VibeField API listening at http://127.0.0.1:${config.port}/api/v1`);
}
void bootstrap().catch(() => { console.error('VibeField startup failed. Check migration readiness, data directory permissions, and the local port.'); process.exitCode = 1; });
