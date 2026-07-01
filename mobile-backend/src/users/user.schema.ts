import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export type UserRole = 'buyer' | 'seller' | 'admin';

@Schema({ timestamps: true, collection: 'users' })
export class User {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ select: false })
  password?: string;

  @Prop({ select: false })
  hashedPassword?: string;

  @Prop({ trim: true })
  firstName?: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop({ trim: true })
  fullName?: string;

  @Prop()
  avatarUrl?: string;

  @Prop()
  profileImage?: string;

  @Prop()
  avatar?: string;

  @Prop()
  image?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ type: [String], enum: ['buyer', 'seller', 'admin'], default: ['buyer'] })
  roles!: UserRole[];

  @Prop({ enum: ['buyer', 'seller', 'admin'], default: 'buyer', index: true })
  primaryRole!: UserRole;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: false })
  isBanned!: boolean;

  @Prop()
  banReason?: string;

  @Prop()
  lastLoginAt?: Date;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;

  @Prop({ default: false })
  hasCompletedOnboarding!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ roles: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ fullName: 'text', firstName: 'text', lastName: 'text', email: 'text', phone: 'text' });
UserSchema.index({ email: 1, phone: 1 });
