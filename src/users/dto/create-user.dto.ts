import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsEnum(['male', 'female', 'other'])
  gender!: 'male' | 'female' | 'other';

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(18)
  @Max(120)
  age!: number;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsEnum(['casual', 'long term', 'unsure'])
  datingPreference?: 'casual' | 'long term' | 'unsure';

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  profilePicUrl?: string;

  @IsOptional()
  @IsEnum(['public', 'private'])
  privacySetting?: 'public' | 'private';
}

