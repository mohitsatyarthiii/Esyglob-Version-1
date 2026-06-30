import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: config.get<string>('MOBILE_APP_ORIGIN') ?? '*',
    credentials: true,
  });

  const port = Number(config.get<string>('PORT') ?? 3001);
  await app.listen(port);
}

void bootstrap();
