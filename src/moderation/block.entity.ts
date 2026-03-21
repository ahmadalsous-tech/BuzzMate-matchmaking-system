import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity({ name: 'Blocks' })
@Unique('unique_block', ['blocker', 'blocked'])
export class Block {
  @PrimaryGeneratedColumn({ name: 'block_id' })
  blockId!: number;

  @ManyToOne(() => User, (u) => u.blocksInitiated, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocker_id' })
  blocker!: User;

  @ManyToOne(() => User, (u) => u.blocksReceived, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'blocked_id' })
  blocked!: User;

  @Column({ name: 'blocker_id' })
  blockerId!: number;

  @Column({ name: 'blocked_id' })
  blockedId!: number;
}
