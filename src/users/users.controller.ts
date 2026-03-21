import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, UseInterceptors, UploadedFile } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  register(@Body() dto: CreateUserDto) {
    return this.usersService.register(dto);
  }

  @Post('login')
  login(@Body() dto: { email: string }) {
    return this.usersService.login(dto.email);
  }

  @Get('auth/google/url')
  async getGoogleAuthUrl(@Query('userId') userIdParam: string) {
    const { google } = require('googleapis');
    
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars not set');
    }
    
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://localhost:3000/users/auth/google/callback'
    );
    
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state: userIdParam,
      prompt: 'consent'
    });
    
    return { url };
  }

  @Get('auth/google/callback')
  async googleAuthCallback(@Query('code') code: string, @Query('state') userIdParam: string, @Res() res: any) {
    const userId = parseInt(userIdParam, 10);
    const { google } = require('googleapis');
    
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars not set');
    }
    
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://localhost:3000/users/auth/google/callback'
    );
    
    const { tokens } = await oauth2Client.getToken(code);
    await this.usersService.saveGoogleTokens(userId, tokens.access_token, tokens.refresh_token);
    
    res.send('<script>window.close();</script>');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Post(':id/upload-picture')
  @UseInterceptors(require('@nestjs/platform-express').FileInterceptor('file'))
  async uploadPicture(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
  ) {
    const url = await this.usersService.uploadProfilePicture(id, file.buffer);
    return { profilePicUrl: url };
  }
}
