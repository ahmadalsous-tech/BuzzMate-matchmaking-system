import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Locations' })
export class Location {
  @PrimaryGeneratedColumn({ name: 'location_id' })
  locationId!: number;

  @Column()
  name!: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ name: 'price_tier', type: 'int', nullable: true })
  priceTier?: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string;

  @Column({ name: 'coords', type: 'point', nullable: true })
  coords?: string;
}
