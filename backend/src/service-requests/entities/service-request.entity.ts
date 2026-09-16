import { Column, Entity, PrimaryColumn } from 'typeorm';
import { RequestStatus } from '../status-transitions';

/** The central durable-state object (data-model.md section 2.1), now backed
 * by a real table instead of an in-memory array. */
@Entity('service_requests')
export class ServiceRequestEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  employeeId: string;

  @Column()
  serviceId: string;

  @Column()
  currentStatus: RequestStatus;

  @Column()
  createdAt: string;
}
