import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Match } from '../matches/match.entity';
import { Message } from './message.entity';

@Entity({ name: 'Conversations' })
@Unique(['match'])
export class Conversation {
  @PrimaryGeneratedColumn({ name: 'conversation_id' })
  conversationId!: number;

  @OneToOne(() => Match, (m) => m.conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match!: Match;

  @Column({ name: 'last_message_preview', type: 'text', nullable: true })
  lastMessagePreview?: string;

  @OneToMany(() => Message, (m) => m.conversation)
  messages?: Message[];
}
