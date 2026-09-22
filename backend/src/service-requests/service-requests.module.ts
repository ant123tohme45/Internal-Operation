import { Module, OnModuleInit } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsService } from './service-requests.service';
import { Employee } from './entities/employee.entity';
import { Service } from './entities/service.entity';
import { ServiceRequestEntity } from './entities/service-request.entity';
import { RequestStatusEventEntity } from './entities/request-status-event.entity';
import { EMPLOYEE_SEED, SERVICE_SEED } from './seed-data';
import { IntakeAiService } from '../ai/intake-ai.service';
import { INTAKE_AI_PROVIDER, createIntakeAiProvider } from '../ai/intake-ai-provider.factory';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Service,
      ServiceRequestEntity,
      RequestStatusEventEntity,
    ]),
  ],
  controllers: [ServiceRequestsController],
  providers: [
    ServiceRequestsService,
    IntakeAiService,
    { provide: INTAKE_AI_PROVIDER, useFactory: () => createIntakeAiProvider() },
  ],
  exports: [TypeOrmModule],
})
export class ServiceRequestsModule implements OnModuleInit {
  constructor(
    @InjectRepository(Employee) private readonly employees: Repository<Employee>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
  ) {}

  /** Seeds the fixed reference rows (seed-data.ts) into the real database on
   * first boot. Idempotent: skipped once rows already exist, so restarts
   * don't duplicate or reset them. */
  async onModuleInit(): Promise<void> {
    if ((await this.employees.count()) === 0) {
      await this.employees.save(EMPLOYEE_SEED);
    }
    if ((await this.services.count()) === 0) {
      await this.services.save(SERVICE_SEED);
    }
  }
}
