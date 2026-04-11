import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match } from './match.entity';
import { UsersService } from '../users/users.service';
import { Conversation } from '../messaging/conversation.entity';
import { DatesService } from '../dates/dates.service';

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(Conversation)
    private readonly convoRepo: Repository<Conversation>,
    private readonly usersService: UsersService,
    private readonly datesService: DatesService,
  ) {}

  async createMutualMatch(user1Id: number, user2Id: number): Promise<Match> {
    const [user1, user2] = await Promise.all([
      this.usersService.findOne(user1Id),
      this.usersService.findOne(user2Id),
    ]);

    const existing = await this.matchRepo.findOne({
      where: [
        { user1Id: user1Id, user2Id: user2Id },
        { user1Id: user2Id, user2Id: user1Id },
      ],
    });
    if (existing) {
      return existing;
    }

    const match = this.matchRepo.create({
      user1,
      user2,
    });
    const saved = await this.matchRepo.save(match);

    const conversation = this.convoRepo.create({
      match: saved,
    });
    await this.convoRepo.save(conversation);

    // Trigger date scheduling suggestion
    await this.datesService.suggestDatesForMatch(saved);

    return saved;
  }

  async listForUser(userId: number): Promise<Match[]> {
    return this.matchRepo.find({
      where: [{ user1Id: userId }, { user2Id: userId }],
      relations: ['user1', 'user2'],
      order: { matchedAt: 'DESC' },
    });
  }

  async unmatchBetween(userId1: number, userId2: number): Promise<Match | null> {
    const match = await this.matchRepo.findOne({
      where: [
        { user1Id: userId1, user2Id: userId2, status: 'active' },
        { user1Id: userId2, user2Id: userId1, status: 'active' },
      ],
    });
    if (!match) return null;
    match.status = 'unmatched';
    return this.matchRepo.save(match);
  }

  async rematchBetween(userId1: number, userId2: number): Promise<Match | null> {
    const match = await this.matchRepo.findOne({
      where: [
        { user1Id: userId1, user2Id: userId2, status: 'unmatched' },
        { user1Id: userId2, user2Id: userId1, status: 'unmatched' },
      ],
    });
    if (!match) return null;
    match.status = 'active';
    return this.matchRepo.save(match);
  }
}

