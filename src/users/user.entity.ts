import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Preference } from '../preferences/preference.entity';
import { Interaction } from '../interactions/interaction.entity';
import { Match } from '../matches/match.entity';
import { Block } from '../moderation/block.entity';
import { Report } from '../moderation/report.entity';
import { Message } from '../messaging/message.entity';

export type AccountStatus = 'active' | 'banned';

@Entity({ name: 'Users' })
export class User {
  @PrimaryGeneratedColumn({ name: 'user_id' })
  userId!: number;

  @Column({ unique: true })
  email!: string;

  @Column({
    type: 'enum',
    enum: ['male', 'female', 'other'],
  })
  gender!: 'male' | 'female' | 'other';

  @Column()
  name!: string;

  @Column()
  age!: number;

  @Column({ nullable: true })
  occupation?: string;

  @Column({
    name: 'Dating_preference',
    type: 'enum',
    enum: ['casual', 'long term', 'unsure'],
    default: 'unsure',
  })
  datingPreference!: 'casual' | 'long term' | 'unsure';

  @Column({ name: 'Address', nullable: true })
  address?: string;

  @Column({ name: 'Phone_Number', nullable: true })
  phoneNumber?: string;

  @Column({ name: 'profile_pic_url', type: 'text', nullable: true })
  profilePicUrl?: string;

  @Column({
    name: 'Privacy_Setting',
    type: 'enum',
    enum: ['public', 'private'],
    default: 'public',
  })
  privacySetting!: 'public' | 'private';

  @Index('idx_status')
  @Column({
    name: 'account_status',
    type: 'enum',
    enum: ['active', 'banned'],
    default: 'active',
  })
  accountStatus!: AccountStatus;

  @Column({ name: 'report_count', type: 'int', default: 0 })
  reportCount!: number;

  @Column({ name: 'google_access_token', type: 'text', nullable: true })
  googleAccessToken?: string;

  @Column({ name: 'google_refresh_token', type: 'text', nullable: true })
  googleRefreshToken?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToOne(() => Preference, (p) => p.user)
  preferences?: Preference;

  @OneToMany(() => Interaction, (i) => i.sender)
  sentInteractions?: Interaction[];

  @OneToMany(() => Interaction, (i) => i.receiver)
  receivedInteractions?: Interaction[];

  @OneToMany(() => Match, (m) => m.user1)
  matchesAsUser1?: Match[];

  @OneToMany(() => Match, (m) => m.user2)
  matchesAsUser2?: Match[];

  @OneToMany(() => Block, (b) => b.blocker)
  blocksInitiated?: Block[];

  @OneToMany(() => Block, (b) => b.blocked)
  blocksReceived?: Block[];

  @OneToMany(() => Report, (r) => r.reporter)
  reportsMade?: Report[];

  @OneToMany(() => Report, (r) => r.reported)
  reportsReceived?: Report[];

  @OneToMany(() => Message, (m) => m.sender)
  messages?: Message[];
}
