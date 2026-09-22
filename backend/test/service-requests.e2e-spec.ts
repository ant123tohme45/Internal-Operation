import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { ServiceRequestsModule } from '../src/service-requests/service-requests.module';
import { Employee } from '../src/service-requests/entities/employee.entity';
import { Service } from '../src/service-requests/entities/service.entity';
import { ServiceRequestEntity } from '../src/service-requests/entities/service-request.entity';
import { RequestStatusEventEntity } from '../src/service-requests/entities/request-status-event.entity';

async function buildApp(): Promise<INestApplication> {
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

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('ServiceRequests HTTP API (e2e)', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    app = await buildApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Regression protection: this is the Week 2 "known good" walkthrough
   * (backend/README.md section 7, verified by hand back then) replayed as
   * an automated test. If a future change to persistence, DTOs, or the
   * cancel feature ever breaks the original submit -> in-progress ->
   * resolved path, this test fails before anyone finds out by hand.
   */
  describe('regression: the Week 2 status-transition walkthrough still behaves the same', () => {
    let requestId: string;

    it('submits a request, starting SUBMITTED', async () => {
      const res = await request(server)
        .post('/api/service-requests')
        .set('X-Employee-Id', 'EMP-1')
        .send({ serviceId: 'SVC-1', comment: 'Need a laptop' })
        .expect(201);

      expect(res.body.currentStatus).toBe('SUBMITTED');
      requestId = res.body.id;
    });

    it('moves SUBMITTED -> IN_PROGRESS', async () => {
      const res = await request(server)
        .patch(`/api/service-requests/${requestId}/status`)
        .set('X-Employee-Id', 'EMP-1')
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(res.body.currentStatus).toBe('IN_PROGRESS');
    });

    it('moves IN_PROGRESS -> RESOLVED, by a different employee than the submitter', async () => {
      const res = await request(server)
        .patch(`/api/service-requests/${requestId}/status`)
        .set('X-Employee-Id', 'EMP-2')
        .send({ status: 'RESOLVED', comment: 'Laptop handed over' })
        .expect(200);

      expect(res.body.currentStatus).toBe('RESOLVED');
    });

    it('refuses to leave a terminal status', async () => {
      const res = await request(server)
        .patch(`/api/service-requests/${requestId}/status`)
        .set('X-Employee-Id', 'EMP-1')
        .send({ status: 'IN_PROGRESS' })
        .expect(400);

      expect(res.body.message).toMatch(/terminal status/);
    });

    it('refuses an unknown employee id on create', async () => {
      const res = await request(server)
        .post('/api/service-requests')
        .set('X-Employee-Id', 'EMP-999')
        .send({ serviceId: 'SVC-1' })
        .expect(400);

      expect(res.body.message).toMatch(/not a known employee id/);
    });

    it('the history stays append-only and current_status matches its last event (ADR-001)', async () => {
      const res = await request(server).get(`/api/service-requests/${requestId}/history`).expect(200);

      expect(res.body.map((e: any) => e.status)).toEqual(['SUBMITTED', 'IN_PROGRESS', 'RESOLVED']);
    });
  });

  describe('the Week 3 cancel flow', () => {
    it('rejects an invalid request: missing X-Employee-Id header on create', async () => {
      const res = await request(server)
        .post('/api/service-requests')
        .send({ serviceId: 'SVC-1' })
        .expect(400);

      expect(res.body.message).toMatch(/X-Employee-Id/);
    });

    it('authorization: the owner can cancel their own SUBMITTED request (allowed)', async () => {
      const created = await request(server)
        .post('/api/service-requests')
        .set('X-Employee-Id', 'EMP-1')
        .send({ serviceId: 'SVC-1' })
        .expect(201);

      const res = await request(server)
        .patch(`/api/service-requests/${created.body.id}/cancel`)
        .set('X-Employee-Id', 'EMP-1')
        .expect(200);

      expect(res.body.currentStatus).toBe('CANCELLED');
    });

    it('authorization: a different employee cannot cancel someone else\'s request (denied)', async () => {
      const created = await request(server)
        .post('/api/service-requests')
        .set('X-Employee-Id', 'EMP-2')
        .send({ serviceId: 'SVC-2' })
        .expect(201);

      const res = await request(server)
        .patch(`/api/service-requests/${created.body.id}/cancel`)
        .set('X-Employee-Id', 'EMP-3')
        .expect(403);

      expect(res.body.message).toMatch(/only its owner/);

      // Denied attempt must not have changed anything.
      const stillThere = await request(server)
        .get(`/api/service-requests/${created.body.id}`)
        .expect(200);
      expect(stillThere.body.currentStatus).toBe('SUBMITTED');
    });

    it('expected failure: cancelling a request that already moved past SUBMITTED is refused, not crashed', async () => {
      const created = await request(server)
        .post('/api/service-requests')
        .set('X-Employee-Id', 'EMP-3')
        .send({ serviceId: 'SVC-3' })
        .expect(201);

      await request(server)
        .patch(`/api/service-requests/${created.body.id}/status`)
        .set('X-Employee-Id', 'EMP-1')
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      const res = await request(server)
        .patch(`/api/service-requests/${created.body.id}/cancel`)
        .set('X-Employee-Id', 'EMP-3')
        .expect(400);

      expect(res.body.message).toMatch(/can no longer be cancelled/);
    });

    it('the ops-team status endpoint refuses to set CANCELLED directly (only the cancel endpoint may)', async () => {
      const created = await request(server)
        .post('/api/service-requests')
        .set('X-Employee-Id', 'EMP-1')
        .send({ serviceId: 'SVC-1' })
        .expect(201);

      const res = await request(server)
        .patch(`/api/service-requests/${created.body.id}/status`)
        .set('X-Employee-Id', 'EMP-1')
        .send({ status: 'CANCELLED' })
        .expect(400);

      expect(res.body.message).toMatch(/PATCH .*\/cancel/);
    });
  });

  describe('registering a new employee', () => {
    it('creates an employee with a unique id', async () => {
      const res = await request(server)
        .post('/api/service-requests/reference/employees')
        .send({ id: 'EMP-100', fullName: 'Test Employee', department: 'Ops' })
        .expect(201);

      expect(res.body).toEqual({ id: 'EMP-100', fullName: 'Test Employee', department: 'Ops' });

      const list = await request(server).get('/api/service-requests/reference/employees').expect(200);
      expect(list.body).toContainEqual({ id: 'EMP-100', fullName: 'Test Employee', department: 'Ops' });
    });

    it('rejects a duplicate id', async () => {
      const res = await request(server)
        .post('/api/service-requests/reference/employees')
        .send({ id: 'EMP-1', fullName: 'Someone Else', department: 'IT' })
        .expect(400);

      expect(res.body.message).toMatch(/already exists/);
    });

    it('rejects a missing required field', async () => {
      const res = await request(server)
        .post('/api/service-requests/reference/employees')
        .send({ id: 'EMP-101', fullName: '', department: 'IT' })
        .expect(400);

      expect(res.body.message).toMatch(/are all required/);
    });
  });

  describe('registering a new service', () => {
    it('creates a service with a unique id', async () => {
      const res = await request(server)
        .post('/api/service-requests/reference/services')
        .send({ id: 'SVC-100', name: 'Standing desk request', departmentOwner: 'Facilities' })
        .expect(201);

      // category/keywords are Week 4 additions (see service.entity.ts) —
      // nullable, so a service created without them still round-trips as
      // null rather than being omitted; registerService itself is
      // unchanged Week 2/3 behaviour, which is what this regression test
      // protects.
      expect(res.body).toEqual({
        id: 'SVC-100',
        name: 'Standing desk request',
        departmentOwner: 'Facilities',
        category: null,
        keywords: null,
      });

      const list = await request(server).get('/api/service-requests/reference/services').expect(200);
      expect(list.body).toContainEqual({
        id: 'SVC-100',
        name: 'Standing desk request',
        departmentOwner: 'Facilities',
        category: null,
        keywords: null,
      });
    });

    it('rejects a duplicate id', async () => {
      const res = await request(server)
        .post('/api/service-requests/reference/services')
        .send({ id: 'SVC-1', name: 'Something else', departmentOwner: 'IT' })
        .expect(400);

      expect(res.body.message).toMatch(/already exists/);
    });

    it('rejects a missing required field', async () => {
      const res = await request(server)
        .post('/api/service-requests/reference/services')
        .send({ id: 'SVC-101', name: '', departmentOwner: 'IT' })
        .expect(400);

      expect(res.body.message).toMatch(/are all required/);
    });
  });
});
