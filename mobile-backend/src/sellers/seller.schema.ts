import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SellerDocument = HydratedDocument<Seller>;

@Schema({ timestamps: true, collection: 'sellers', strict: false })
export class Seller {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ trim: true })
  companyName?: string;

  @Prop({ trim: true })
  businessName?: string;

  @Prop({ trim: true, lowercase: true })
  businessEmail?: string;

  @Prop({ trim: true })
  businessPhone?: string;

  @Prop({
    enum: ['pending', 'under_review', 'verified', 'rejected', 'suspended'],
    default: 'pending',
    index: true,
  })
  verificationStatus!: string;

  @Prop({ default: false })
  isVerified!: boolean;
}

export const SellerSchema = SchemaFactory.createForClass(Seller);
