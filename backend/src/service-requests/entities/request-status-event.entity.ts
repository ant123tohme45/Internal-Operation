import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { RequestStatus } from '../status-transitions';

/** One append-only row explaining how a request reached its current status
 * (data-model.md section 2.1; why it exists at all is ADR-001). Rows are
 * only ever inserted, never updated or deleted. */
@Entity('request_status_events')
export class RequestStatusEventEntity {
  @PrimaryColumn()
  id: string;

  @Index() // supports the "full history by request_id" access pattern (data-model.md section 6)
  @Column()
  requestId: string;

  @Column()
  status: RequestStatus;

  @Column()
  changedBy: string; // employee id of the actor who made the change

  @Column()
  occurredAt: string; // ISO timestamp

  @Column({ nullable: true })
  comment?: string;
}
