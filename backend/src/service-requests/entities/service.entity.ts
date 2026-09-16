import { Column, Entity, PrimaryColumn } from 'typeorm';

/** A known catalog item a request can be made against (data-model.md section 2.1). */
@Entity('services')
export class Service {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  departmentOwner: string;
}
