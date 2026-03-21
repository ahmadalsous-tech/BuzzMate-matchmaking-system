import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Match } from '../matches/match.entity';
import { Location } from './location.entity';

@Entity({ name: 'Suggested_Dates' })
export class SuggestedDate {
  @PrimaryGeneratedColumn({ name: 'suggestion_id' })
  suggestionId!: number;

  @ManyToOne(() => Match, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match!: Match;

  @ManyToOne(() => Location, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location!: Location;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['suggested', 'accepted_by_user_1', 'accepted_by_user_2', 'accepted_by_both'],
    default: 'suggested',
  })
  status!: 'suggested' | 'accepted_by_user_1' | 'accepted_by_user_2' | 'accepted_by_both';

  @Column({ name: 'scheduled_start', type: 'datetime', nullable: true })
  scheduledStart?: Date;

  @Column({ name: 'scheduled_end', type: 'datetime', nullable: true })
  scheduledEnd?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Index('idx_match')
  @Column({ name: 'match_id' })
  matchId!: number;
}

