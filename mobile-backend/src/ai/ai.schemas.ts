import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type AIChatDocument = HydratedDocument<AIChat>;
export type SavedResearchReportDocument = HydratedDocument<SavedResearchReport>;

@Schema({ timestamps: true, collection: 'ai_chats', strict: false })
export class AIChat {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ trim: true, default: 'New chat' })
  title!: string;

  @Prop({ trim: true, default: 'buyer', index: true })
  roleContext!: string;

  @Prop({ trim: true, default: 'assistant', index: true })
  conversationType!: string;

  @Prop({ trim: true, default: 'esyglob_mobile_intelligence' })
  provider!: string;

  @Prop({ trim: true, default: 'marketplace-context-v1' })
  model!: string;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  messages!: Array<Record<string, unknown>>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  context!: Record<string, unknown>;

  @Prop({ enum: ['active', 'archived'], default: 'active', index: true })
  status!: string;

  @Prop({ type: Number, default: 0 })
  totalTokensUsed!: number;

  @Prop({ type: Number, default: 0 })
  totalMessages!: number;

  @Prop({ type: Date, default: Date.now, index: true })
  lastMessageAt!: Date;
}

@Schema({ timestamps: true, collection: 'saved_research_reports', strict: false })
export class SavedResearchReport {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ trim: true, required: true })
  title!: string;

  @Prop({ trim: true, default: 'product', index: true })
  reportType!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  request!: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  report!: Record<string, unknown>;

  @Prop({ enum: ['active', 'archived'], default: 'active', index: true })
  status!: string;
}

export const AIChatSchema = SchemaFactory.createForClass(AIChat);
export const SavedResearchReportSchema = SchemaFactory.createForClass(SavedResearchReport);

AIChatSchema.index({ userId: 1, status: 1, lastMessageAt: -1 });
AIChatSchema.index({ userId: 1, roleContext: 1, status: 1, lastMessageAt: -1 });
SavedResearchReportSchema.index({ userId: 1, reportType: 1, createdAt: -1 });
