import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { Employee } from './service-requests/entities/employee.entity';
import { Service } from './service-requests/entities/service.entity';
import { ServiceRequestEntity } from './service-requests/entities/service-request.entity';
import { RequestStatusEventEntity } from './service-requests/entities/request-status-event.entity';

// DB_PATH lets tests point at their own throwaway file instead of the real
// one (see test/ and jest config) — defaults to a real file on disk so data
// survives restarts (this week's actual DB requirement).
const databasePath = process.env.DB_PATH ?? 'data/operations-hub.sqlite';
if (databasePath !== ':memory:') {
  mkdirSync(dirname(databasePath), { recursive: true });
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: databasePath,
      entities: [Employee, Service, ServiceRequestEntity, RequestStatusEventEntity],
      synchronize: true, // fine for this teaching project; a real product would use migrations
    }),
    ServiceRequestsModule,
  ],
})
export class AppModule {}
