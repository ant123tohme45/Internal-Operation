import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** This is the entry point: the first backend file that runs. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Lets the React frontend (a different origin, see ../../frontend) call this API.
  app.enableCors();

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`Operations Hub backend is running on http://localhost:${port}`);
}

bootstrap();
