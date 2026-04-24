import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { User } from './users/user.entity';
import { Preference } from './preferences/preference.entity';
import { Interaction } from './interactions/interaction.entity';
import { Match } from './matches/match.entity';
import { DiscoverSuggestion } from './discover/discover-suggestion.entity';
import { Location } from './dates/location.entity';
import { SuggestedDate } from './dates/suggested-date.entity';
import { Block } from './moderation/block.entity';
import { Report } from './moderation/report.entity';
import { Conversation } from './messaging/conversation.entity';
import { Message } from './messaging/message.entity';
import { UsersModule } from './users/users.module';
import { PreferencesModule } from './preferences/preferences.module';
import { InteractionsModule } from './interactions/interactions.module';
import { MatchesModule } from './matches/matches.module';
import { DiscoverModule } from './discover/discover.module';
import { DatesModule } from './dates/dates.module';
import { MessagingModule } from './messaging/messaging.module';
import { ModerationModule } from './moderation/moderation.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'mysql',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        username: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || 'Mysqlpassword',
        database: process.env.DB_DATABASE || 'BuzzMateDB',
        legacySpatialSupport: false,
        entities: [
          User,
          Preference,
          Interaction,
          Match,
          DiscoverSuggestion,
          Location,
          SuggestedDate,
          Block,
          Report,
          Conversation,
          Message,
        ],
        synchronize: false,
      }),
    }),
    UsersModule,
    PreferencesModule,
    InteractionsModule,
    MatchesModule,
    DiscoverModule,
    DatesModule,
    MessagingModule,
    ModerationModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

