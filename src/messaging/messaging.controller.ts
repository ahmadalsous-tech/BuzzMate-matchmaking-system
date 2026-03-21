import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { MessagingService } from './messaging.service';

@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) { }

  @Get('conversation/:conversationId/messages')
  listMessages(@Param('conversationId', ParseIntPipe) conversationId: number) {
    return this.messagingService.listMessages(conversationId);
  }
  @Get('user/:userId/conversations')
  getConversationsForUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.messagingService.getConversationsForUser(userId);
  }
}

