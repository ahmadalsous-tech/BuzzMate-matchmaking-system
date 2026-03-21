import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscoverSuggestion } from './discover-suggestion.entity';
import { DiscoverService } from './discover.service';
import { DiscoverController } from './discover.controller';
import { UsersModule } from '../users/users.module';
import { Preference } from '../preferences/preference.entity';
import { DiscoverCron } from './discover.cron';

import { User } from '../users/user.entity';
import { Interaction } from '../interactions/interaction.entity';
import { Block } from '../moderation/block.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DiscoverSuggestion, Preference, User, Interaction, Block]), UsersModule],
  providers: [DiscoverService, DiscoverCron],
  controllers: [DiscoverController],
  exports: [DiscoverService],
})
export class DiscoverModule {}
