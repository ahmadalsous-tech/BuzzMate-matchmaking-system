import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interaction } from './interaction.entity';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { UsersService } from '../users/users.service';
import { MatchesService } from '../matches/matches.service';

@Injectable()
export class InteractionsService {
  constructor(
    @InjectRepository(Interaction)
    private readonly interactionRepo: Repository<Interaction>,
    private readonly usersService: UsersService,
    private readonly matchesService: MatchesService,
  ) {}

  async recordInteraction(dto: CreateInteractionDto) {
    const [sender, receiver] = await Promise.all([
      this.usersService.findOne(dto.senderId),
      this.usersService.findOne(dto.receiverId),
    ]);
 // Idempotency guard: each user can only interact with a given candidate once
    // per weekly batch. The DB has a UNIQUE KEY on (sender_id, receiver_id) as
    // a safety net, but we enforce it here to return a clean 200 instead of a
    // constraint-violation crash, and to avoid triggering the mutual-like check
    // a second time on duplicate requests.
    const existing = await this.interactionRepo.findOne({
      where: { senderId: dto.senderId, receiverId: dto.receiverId },
    });
    if (existing) {
      return { interaction: existing, match: null };
    }
    const interaction = this.interactionRepo.create({
      sender,
      receiver,
      actionType: dto.actionType,
      senderId: dto.senderId,
      receiverId: dto.receiverId,
    });
    await this.interactionRepo.save(interaction);

    let match = null;
    if (dto.actionType === 'like') {
      const mutual = await this.interactionRepo.findOne({
        where: {
          senderId: dto.receiverId,
          receiverId: dto.senderId,
          actionType: 'like',
        },
      });
      if (mutual) {
        match = await this.matchesService.createMutualMatch(dto.senderId, dto.receiverId);
      }
    }

    // Return both so the client can show a match celebration when match !== null
    return { interaction, match };
  }
}