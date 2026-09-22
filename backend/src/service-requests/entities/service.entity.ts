import { Column, Entity, PrimaryColumn } from 'typeorm';

/** A known catalog item a request can be made against (data-model.md section 2.1).
 *
 * `category` and `keywords` were added in Week 4 to close a gap between
 * data-model.md section 2.1 (which always specified `category` on Service)
 * and the Week 2/3 implementation, which never persisted it — browse/search
 * was designed in architecture.md but had no backend support until now
 * (see docs/week4-production-ai.md, "Corrections carried from Weeks 1-3").
 * `keywords` is new: extra match terms (e.g. "screen", "battery" for a
 * laptop service) that free text is unlikely to restate verbatim from the
 * service name alone — used by both browse/search and the AI intake
 * heuristic provider. Both columns are optional so existing rows/tests
 * that don't set them keep working. */
@Entity('services')
export class Service {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  departmentOwner: string;

  @Column({ nullable: true })
  category?: string;

  @Column('simple-array', { nullable: true })
  keywords?: string[];
}
