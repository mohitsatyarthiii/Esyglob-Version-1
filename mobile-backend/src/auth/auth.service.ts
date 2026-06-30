import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { Seller } from '../sellers/seller.schema';
import { SellerVerification } from '../sellers/seller-verification.schema';
import { User, UserDocument, UserRole } from '../users/user.schema';
import { PasswordService } from './password.service';
import { JwtPayload, SerializedUser } from './auth.types';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['buyer', 'seller']),
  companyName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(24),
  password: z.string().min(8),
});

const verifyEmailSchema = z.object({
  token: z.string().min(6),
});

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Seller.name) private readonly sellers: Model<Seller>,
    @InjectModel(SellerVerification.name) private readonly verifications: Model<SellerVerification>,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(input: unknown) {
    const dto = this.parse(loginSchema, input);
    const email = dto.email.trim().toLowerCase();
    const user = await this.users
      .findOne({ email })
      .select('+passwordHash +password +hashedPassword');

    if (!user || !this.passwords.verify(dto.password, this.getStoredPassword(user))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    this.assertCanLogin(user);
    user.lastLoginAt = new Date();
    await user.save();

    if (user.roles.includes('seller')) {
      await this.ensureSellerDefaults(user, undefined);
    }

    return this.issueSession(user);
  }

  async signup(input: unknown) {
    const dto = this.parse(signupSchema, input);
    const email = dto.email.toLowerCase();
    const existing = await this.users.exists({ email });

    if (existing) {
      throw new BadRequestException('An account with this email already exists.');
    }

    const [firstName, ...rest] = dto.name.split(/\s+/);
    const roles: UserRole[] = [dto.role];
    const userCount = await this.users.estimatedDocumentCount();

    if (userCount === 0) {
      roles.push('admin');
    }

    const user = await this.users.create({
      email,
      passwordHash: this.passwords.hash(dto.password),
      firstName,
      lastName: rest.join(' ') || undefined,
      fullName: dto.name,
      phone: dto.phone,
      roles,
      primaryRole: dto.role,
      isActive: true,
      isBanned: false,
      metadata: {},
      hasCompletedOnboarding: false,
    });

    if (dto.role === 'seller') {
      await this.ensureSellerDefaults(user, dto.companyName);
    }

    return this.issueSession(user);
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Session user no longer exists.');
    }

    this.assertCanLogin(user);
    return { user: await this.serializeUser(user) };
  }

  async logout(authorization?: string) {
    void authorization;
    return { success: true };
  }

  async forgotPassword(input: unknown) {
    const dto = this.parse(forgotPasswordSchema, input);
    const user = await this.users.findOne({ email: dto.email.toLowerCase() });
    const token = randomBytes(32).toString('hex');

    if (user) {
      await this.users.updateOne(
        { _id: user._id },
        {
          $set: {
            'metadata.mobilePasswordReset': {
              tokenHash: this.hashToken(token),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            },
          },
        },
      );
    }

    return {
      requested: true,
      ...(this.config.get<string>('RETURN_PASSWORD_RESET_TOKEN') === 'true' && user ? { resetToken: token } : {}),
    };
  }

  async resetPassword(input: unknown) {
    const dto = this.parse(resetPasswordSchema, input);
    const user = await this.users.findOne({
      'metadata.mobilePasswordReset.tokenHash': this.hashToken(dto.token),
      'metadata.mobilePasswordReset.expiresAt': { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Password reset token is invalid or expired.');
    }

    user.passwordHash = this.passwords.hash(dto.password);
    user.set('metadata.mobilePasswordReset', undefined);
    await user.save();

    return { reset: true };
  }

  async verifyEmail(input: unknown) {
    const dto = this.parse(verifyEmailSchema, input);
    const tokenHash = this.hashToken(dto.token);
    const user = await this.users.findOne({
      'metadata.emailVerification.tokenHash': tokenHash,
      'metadata.emailVerification.expiresAt': { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Email verification token is invalid or expired.');
    }

    user.set('metadata.emailVerified', true);
    user.set('metadata.emailVerifiedAt', new Date());
    user.set('metadata.emailVerification', undefined);
    await user.save();

    return { verified: true };
  }

  async verifyAccessToken(token: string) {
    let payload: JwtPayload;

    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired.');
    }

    const user = await this.users.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Session user no longer exists.');
    }

    this.assertCanLogin(user);

    return {
      sub: user._id.toString(),
      email: user.email,
      roles: user.roles,
    };
  }

  private async issueSession(user: UserDocument) {
    const serialized = await this.serializeUser(user);
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      roles: user.roles,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.jwtExpiresIn('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
    return {
      user: serialized,
      accessToken,
      tokenType: 'Bearer',
    };
  }

  private async serializeUser(user: UserDocument): Promise<SerializedUser> {
    const seller = user.roles.includes('seller') ? await this.sellers.findOne({ userId: user._id }) : null;
    const activeRole = user.primaryRole === 'seller' && user.roles.includes('seller') ? 'seller' : 'buyer';

    return {
      id: user._id.toString(),
      _id: user._id.toString(),
      email: user.email,
      name: user.fullName ?? user.firstName ?? user.email.split('@')[0],
      fullName: user.fullName,
      phone: user.phone,
      roles: user.roles,
      activeRole,
      sellerId: seller?._id.toString(),
    };
  }

  private async ensureSellerDefaults(user: UserDocument, companyName?: string) {
    const seller = await this.sellers.findOneAndUpdate(
      { userId: user._id },
      {
        $setOnInsert: {
          userId: user._id,
          companyName: companyName ?? user.fullName,
          businessName: companyName ?? user.fullName,
          businessEmail: user.email,
          businessPhone: user.phone,
          verificationStatus: 'pending',
          isVerified: false,
        },
      },
      { upsert: true, new: true },
    );

    await this.verifications.updateOne(
      { sellerId: seller._id },
      {
        $setOnInsert: {
          sellerId: seller._id,
          userId: user._id,
          status: 'pending',
          documents: [],
        },
      },
      { upsert: true },
    );
  }

  private assertCanLogin(user: UserDocument) {
    if (!user.isActive || user.isBanned) {
      throw new UnauthorizedException(user.banReason || 'This account is not active.');
    }

    if (!user.roles.some(role => role === 'buyer' || role === 'seller')) {
      throw new UnauthorizedException('Only buyer and seller accounts can use the mobile app.');
    }
  }

  private parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map(issue => issue.message).join(', '));
    }

    return result.data;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private jwtExpiresIn(key: string, fallback: string): JwtSignOptions['expiresIn'] {
    return (this.config.get<string>(key) ?? fallback) as JwtSignOptions['expiresIn'];
  }

  private getStoredPassword(user: UserDocument) {
    return user.passwordHash ?? user.password ?? user.hashedPassword;
  }
}
