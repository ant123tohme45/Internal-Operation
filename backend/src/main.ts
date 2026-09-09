import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** This is the entry point: the first backend file that runs. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Leaves room for a future frontend (a different origin) to call this API.
  // No frontend exists yet this week — see README.md section "Non-goals".
  app.enableCors();

  await app.listen(3000);
  console.log('Operations Hub backend is running on http://localhost:3000');
}

bootstrap();
