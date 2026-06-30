import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SellerVerificationDocument = HydratedDocument<SellerVerification>;

@Schema({ timestamps: true, collection: 'sellerverifications' })
export class SellerVerification {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Seller', required: true, index: true })
  sellerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({
    enum: [
      'pending',
      'document_submitted',
      'document_review',
      'info_requested',
      'manual_verification',
      'under_review',
      'approved',
      'rejected',
      'suspended',
    ],
    default: 'pending',
    index: true,
  })
  status!: string;

  @Prop({ type: Array, default: [] })
  documents!: unknown[];
}

export const SellerVerificationSchema = SchemaFactory.createForClass(SellerVerification);
