import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { UsersService } from '../users/users.service';
import { Block } from '../moderation/block.entity';

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(Conversation)
    private readonly convoRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
    @InjectRepository(Block)
    private readonly blockRepo: Repository<Block>,
    private readonly usersService: UsersService,
  ) { }

  async getConversation(conversationId: number): Promise<Conversation> {
    const convo = await this.convoRepo.findOne({
      where: { conversationId },
      relations: ['match', 'match.user1', 'match.user2'],
    });
    if (!convo) {
      throw new NotFoundException('Conversation not found');
    }
    return convo;
  }

  async sendMessage(
    conversationId: number,
    senderId: number,
    body: string,
  ): Promise<Message> {
    const convo = await this.getConversation(conversationId);
    const sender = await this.usersService.findOne(senderId);

    const otherUserId =
      convo.match.user1Id === senderId ? convo.match.user2Id : convo.match.user1Id;

    const block = await this.blockRepo.findOne({
      where: [
        { blockerId: senderId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: senderId },
      ],
    });

    if (block) {
      throw new ForbiddenException('Messaging blocked between these users');
    }

    const message = this.msgRepo.create({
      conversation: convo,
      sender,
      conversationId,
      messageBody: body,
    });
    const saved = await this.msgRepo.save(message);

    convo.lastMessagePreview = body.slice(0, 140);
    await this.convoRepo.save(convo);

    return saved;
  }

  async listMessages(conversationId: number): Promise<Message[]> {
    await this.getConversation(conversationId);
    return this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }
  async getConversationsForUser(userId: number): Promise<Conversation[]> {
    return this.convoRepo
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.match', 'm')
      .innerJoinAndSelect('m.user1', 'u1')
      .innerJoinAndSelect('m.user2', 'u2')
      .where('m.user_1_id = :userId OR m.user_2_id = :userId', { userId })
      .orderBy('c.conversation_id', 'DESC')
      .getMany();
  }
}

