import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { INestApplication } from '@nestjs/common';
import { ServiceRequestsModule } from '../src/service-requests/service-requests.module';
import { ServiceRequestsService } from '../src/service-requests/service-requests.service';
import { Employee } from '../src/service-requests/entities/employee.entity';
import { Service } from '../src/service-requests/entities/service.entity';
import { ServiceRequestEntity } from '../src/service-requests/entities/service-request.entity';
import { RequestStatusEventEntity } from '../src/service-requests/entities/request-status-event.entity';

/**
 * Integration test: the service layer against a real database engine
 * (SQLite, in-memory for test speed — same driver, same SQL dialect, same
 * TypeORM repositories the real app uses via better-sqlite3), not a mock
 * repository. It proves two things a unit test with a fake repository
 * cannot: that createRequest/cancelRequest actually survive a round trip
 * through SQL, and that the ownership check in cancelRequest is enforced
 * against a row that really came back from the database.
 */
describe('ServiceRequestsService <-> SQLite (integration)', () => {
  let app: INestApplication;
  let service: ServiceRequestsService;
  let requestRepo: Repository<ServiceRequestEntity>;
  let eventRepo: Repository<RequestStatusEventEntity>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Employee, Service, ServiceRequestEntity, RequestStatusEventEntity],
          synchronize: true,
        }),
        ServiceRequestsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init(); // runs ServiceRequestsModule.onModuleInit(), which seeds Employee/Service rows

    service = moduleRef.get(ServiceRequestsService);
    requestRepo = moduleRef.get(getRepositoryToken(ServiceRequestEntity));
    eventRepo = moduleRef.get(getRepositoryToken(RequestStatusEventEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists a created request as a real row, independently readable back from the database', async () => {
    const created = await service.createRequest('EMP-1', 'SVC-1', 'Need a laptop');

    const row = await requestRepo.findOneBy({ id: created.id });
    expect(row).not.toBeNull();
    expect(row?.employeeId).toBe('EMP-1');
    expect(row?.currentStatus).toBe('SUBMITTED');

    const events = await eventRepo.find({ where: { requestId: created.id } });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('SUBMITTED');
  });

  it('cancel persists the new status and appends a history row, both readable directly from the database', async () => {
    const created = await service.createRequest('EMP-2', 'SVC-2');

    await service.cancelRequest(created.id, 'EMP-2');

    const row = await requestRepo.findOneBy({ id: created.id });
    expect(row?.currentStatus).toBe('CANCELLED');

    const events = await eventRepo.find({ where: { requestId: created.id } });
    expect(events.map((e) => e.status).sort()).toEqual(['CANCELLED', 'SUBMITTED']);
  });

  it('rejects cancelling a request owned by a different employee, checked against the real stored row', async () => {
    const created = await service.createRequest('EMP-3', 'SVC-3');

    await expect(service.cancelRequest(created.id, 'EMP-1')).rejects.toThrow(/only its owner/);

    // The database row must be untouched by the denied attempt.
    const row = await requestRepo.findOneBy({ id: created.id });
    expect(row?.currentStatus).toBe('SUBMITTED');
  });
});
