import { Column, Entity, PrimaryColumn } from 'typeorm';

/** A known employee who can submit requests (data-model.md section 2.1). */
@Entity('employees')
export class Employee {
  @PrimaryColumn()
  id: string;

  @Column()
  fullName: string;

  @Column()
  department: string;
}
