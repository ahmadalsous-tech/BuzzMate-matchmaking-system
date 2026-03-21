import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async register(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      if (existing.accountStatus === 'banned') {
        throw new ForbiddenException('Account is banned');
      }
      return existing;
    }

    const user = this.usersRepo.create({
      email: dto.email,
      gender: dto.gender,
      name: dto.name,
      age: dto.age,
      occupation: dto.occupation,
      datingPreference: dto.datingPreference,
      address: dto.address,
      phoneNumber: dto.phoneNumber,
      profilePicUrl: dto.profilePicUrl,
      privacySetting: dto.privacySetting,
    });

    return this.usersRepo.save(user);
  }

  async findOne(userId: number): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async login(email: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found. Please sign up first.');
    }
    if (user.accountStatus === 'banned') {
      throw new ForbiddenException('Account is banned');
    }
    return user;
  }

  async update(userId: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(userId);
    if (user.accountStatus === 'banned') {
      throw new ForbiddenException('Account is banned');
    }
    // Strip sensitive fields that should not be user-settable
    const { accountStatus, reportCount, ...safeDto } = dto as any;
    Object.assign(user, safeDto);
    return this.usersRepo.save(user);
  }

  /** Internal method for system operations (e.g. banning). Bypasses DTO restrictions. */
  async updateInternal(userId: number, data: Partial<User>): Promise<User> {
    const user = await this.findOne(userId);
    Object.assign(user, data);
    return this.usersRepo.save(user);
  }

  async saveGoogleTokens(userId: number, accessToken: string, refreshToken: string) {
    const user = await this.findOne(userId);
    user.googleAccessToken = accessToken;
    if (refreshToken) user.googleRefreshToken = refreshToken;
    return this.usersRepo.save(user);
  }

  async uploadProfilePicture(userId: number, fileBuffer: Buffer): Promise<string> {
    const user = await this.findOne(userId);
    
    // Cloudinary dynamic import for avoiding global scope failures if env lacks
    const cloudinary = require('cloudinary').v2;
    const toStream = require('buffer-to-stream');

    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      throw new Error('Cloudinary environment variables are not configured.');
    }

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        { folder: 'buzzmate_profiles' },
        (error: any, result: any) => {
          if (error) return reject(error);
          user.profilePicUrl = result.secure_url;
          this.usersRepo.save(user).then(() => resolve(result.secure_url)).catch(reject);
        }
      );
      toStream(fileBuffer).pipe(upload);
    });
  }
}
