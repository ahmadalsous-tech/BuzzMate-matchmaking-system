import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SuggestedDate } from './suggested-date.entity';
import { Location } from './location.entity';
import { UsersService } from '../users/users.service';
import { PreferencesService } from '../preferences/preferences.service';
import { google } from 'googleapis';
import { Match } from '../matches/match.entity';

@Injectable()
export class DatesService {
  private readonly logger = new Logger(DatesService.name);

  constructor(
    @InjectRepository(SuggestedDate)
    private readonly suggestedDateRepo: Repository<SuggestedDate>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly usersService: UsersService,
    private readonly preferencesService: PreferencesService,
  ) { }

  async suggestDateForMatch(match: Match): Promise<SuggestedDate | null> {
    try {
      const user1 = await this.usersService.findOne(match.user1Id);
      const user2 = await this.usersService.findOne(match.user2Id);

      const pref1 = await this.preferencesService.getForUser(match.user1Id).catch(() => null);
      const pref2 = await this.preferencesService.getForUser(match.user2Id).catch(() => null);

      // Simple preference matching logic (Location category)
      let preferredCategory: string | undefined;
      if (pref1?.dateMood && pref2?.dateMood && pref1.dateMood === pref2.dateMood && pref1.dateMood !== 'unsure') {
        preferredCategory = pref1.dateMood;
      }

      // Resolve location based on mutually preferred mood, or random Location
      const query = this.locationRepo.createQueryBuilder('location');
      if (preferredCategory) {
        query.where('location.category = :category', { category: preferredCategory });
      }
      query.orderBy('RAND()').limit(1);

      let location = await query.getOne();
      if (!location) {
        // Fallback to any location
        location = await this.locationRepo.createQueryBuilder('location').orderBy('RAND()').limit(1).getOne();
      }

      if (!location) {
        this.logger.warn('No locations available in the database.');
        return null; // DB might be empty
      }

      // Check Google Calendar API for mutually available slots
      const timeSlot = await this.suggestMutualSlot(
        user1.email,
        user1.googleRefreshToken,
        user2.email,
        user2.googleRefreshToken
      );

      if (!timeSlot) {
        this.logger.warn(`Could not find mutual availability for Match ${match.matchId}, but proposing date anyway.`);
        // In reality we might schedule something async, but here we just proceed to propose
      }

      // Generate suggested date
      const suggestedDate = this.suggestedDateRepo.create({
        match,
        location,
        status: 'suggested',
        scheduledStart: timeSlot ? timeSlot.start : undefined,
        scheduledEnd: timeSlot ? timeSlot.end : undefined,
      });

      return await this.suggestedDateRepo.save(suggestedDate);

    } catch (error) {
      this.logger.error(`Failed to suggest date for match ${match.matchId}`, error);
      return null;
    }
  }

  async acceptDate(suggestionId: number, userId: number): Promise<SuggestedDate> {
    const suggestion = await this.suggestedDateRepo.findOne({
      where: { suggestionId },
      relations: ['match', 'match.user1', 'match.user2'],
    });

    if (!suggestion) throw new Error('Suggested date not found');

    const match = suggestion.match;
    const isUser1 = match.user1Id === userId;
    const isUser2 = match.user2Id === userId;

    if (!isUser1 && !isUser2) throw new Error('User not part of this match');

    if (suggestion.status === 'accepted_by_both') {
      return suggestion; // Already accepted
    }

    if (suggestion.status === 'suggested') {
      suggestion.status = isUser1 ? 'accepted_by_user_1' : 'accepted_by_user_2';
    } else if (suggestion.status === 'accepted_by_user_1') {
      if (isUser2) suggestion.status = 'accepted_by_both';
    } else if (suggestion.status === 'accepted_by_user_2') {
      if (isUser1) suggestion.status = 'accepted_by_both';
    }

    const saved = await this.suggestedDateRepo.save(suggestion);

    if (saved.status === 'accepted_by_both' && saved.scheduledStart && saved.scheduledEnd) {
      await this.bookCalendarEvent(match.user1.email, match.user1.googleRefreshToken, match.user2.email, match.user2.googleRefreshToken, saved.scheduledStart, saved.scheduledEnd);
    }

    return saved;
  }
  async rejectDate(suggestionId: number, userId: number): Promise<SuggestedDate> {
    const suggestion = await this.suggestedDateRepo.findOne({
      where: { suggestionId },
      relations: ['match'],
    });
    if (!suggestion) throw new Error('Suggested date not found');
    const match = suggestion.match;
    const isUser1 = match.user1Id === userId;
    const isUser2 = match.user2Id === userId;
    if (!isUser1 && !isUser2) throw new Error('User not part of this match');
    suggestion.status = 'suggested'; // Reset to suggested so a new date can be proposed
    return await this.suggestedDateRepo.save(suggestion);
  }
  async getDatesForUser(userId: number): Promise<SuggestedDate[]> {
    return this.suggestedDateRepo
      .createQueryBuilder('sd')
      .innerJoinAndSelect('sd.match', 'm')
      .innerJoinAndSelect('sd.location', 'l')
      .innerJoinAndSelect('m.user1', 'u1')
      .innerJoinAndSelect('m.user2', 'u2')
      .where('m.user_1_id = :userId OR m.user_2_id = :userId', { userId })
      .orderBy('sd.created_at', 'DESC')
      .getMany();
  }

  private async suggestMutualSlot(user1Email: string, token1?: string, user2Email?: string, token2?: string): Promise<{start: Date, end: Date} | null> {
    if (!token1 || !token2 || !user2Email) {
      this.logger.debug('One or both users missing Google Calendar tokens, skipping check.');
      return null;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const tokenUri = process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token';
    if (!clientId || !clientSecret) {
      this.logger.warn('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars not set, skipping calendar check.');
      return null;
    }
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const path = require('path');
      const execAsync = promisify(exec);

      const isDist = __dirname.includes('dist');
      const baseDir = isDist ? path.join(__dirname, '..', '..') : path.join(__dirname, '..', '..', 'src');

      const scriptPath = path.join(baseDir, 'PythonBackend', 'calendar_script.py');
      const { stdout } = await execAsync(`python "${scriptPath}" suggest`, {
        env: {
          ...process.env,
          U1_EMAIL: user1Email,
          U1_REFRESH: token1,
          U2_EMAIL: user2Email,
          U2_REFRESH: token2,
          GOOGLE_CLIENT_ID: clientId,
          GOOGLE_CLIENT_SECRET: clientSecret,
          GOOGLE_TOKEN_URI: tokenUri
        }
      });

      const result = JSON.parse(stdout.trim());
      if (result.status === 'success') {
        return { start: new Date(result.start), end: new Date(result.end) };
      } else {
        this.logger.warn(`Python calendar script returned error: ${result.error}`);
        return null;
      }
    } catch (e: any) {
      this.logger.error(`Failed to execute python calendar script: ${e.message}`);
      return null;
    }
  }

  private async bookCalendarEvent(user1Email: string, token1?: string, user2Email?: string, token2?: string, start?: Date, end?: Date): Promise<boolean> {
    if (!token1 || !token2 || !user2Email || !start || !end) return false;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const tokenUri = process.env.GOOGLE_TOKEN_URI || 'https://oauth2.googleapis.com/token';
    if (!clientId || !clientSecret) return false;

    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const path = require('path');
      const execAsync = promisify(exec);

      const isDist = __dirname.includes('dist');
      const baseDir = isDist ? path.join(__dirname, '..', '..') : path.join(__dirname, '..', '..', 'src');

      const scriptPath = path.join(baseDir, 'PythonBackend', 'calendar_script.py');
      const { stdout } = await execAsync(`python "${scriptPath}" book "${start.toISOString()}" "${end.toISOString()}"`, {
        env: {
          ...process.env,
          U1_EMAIL: user1Email,
          U1_REFRESH: token1,
          U2_EMAIL: user2Email,
          U2_REFRESH: token2,
          GOOGLE_CLIENT_ID: clientId,
          GOOGLE_CLIENT_SECRET: clientSecret,
          GOOGLE_TOKEN_URI: tokenUri
        }
      });

      const result = JSON.parse(stdout.trim());
      if (result.status === 'success') {
        this.logger.log(`Successfully booked date slot. Event Link: ${result.eventLink}`);
        return true;
      } else {
        this.logger.warn(`Python calendar script returned error: ${result.error}`);
        return false;
      }
    } catch (e: any) {
      this.logger.error(`Failed to execute python calendar script: ${e.message}`);
      return false;
    }
  }
}
