import { Controller, Get, Param, ParseIntPipe, Post, Body } from '@nestjs/common';
import { DatesService } from './dates.service';

@Controller('dates')
export class DatesController {
  constructor(private readonly datesService: DatesService) { }
  @Get('user/:userId')
  getDatesForUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.datesService.getDatesForUser(userId);
  }

  @Post(':suggestionId/accept')
  acceptDate(
    @Param('suggestionId', ParseIntPipe) suggestionId: number,
    @Body('userId') userId: number,
  ) {
    if (!userId) {
      throw new Error('userId is required in the body');
    }
    return this.datesService.acceptDate(suggestionId, userId);
  }
  @Post(':suggestionId/reject')
  rejectDate(
    @Param('suggestionId', ParseIntPipe) suggestionId: number,
    @Body('userId') userId: number,
  ) {
    if (!userId) {
      throw new Error('userId is required in the body');
    }
    return this.datesService.rejectDate(suggestionId, userId);
  }

  @Post('user/:userId/refresh')
  async refreshUserSuggestions(@Param('userId', ParseIntPipe) userId: number) {
    await this.datesService.refreshUserSuggestions(userId);
    return { success: true };
  }
}
