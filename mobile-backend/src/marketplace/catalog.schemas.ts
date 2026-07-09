import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;
export type SubcategoryDocument = HydratedDocument<Subcategory>;
export type ProductDocument = HydratedDocument<Product>;
export type RfqDocument = HydratedDocument<Rfq>;
export type QuotationDocument = HydratedDocument<Quotation>;
export type ChatDocument = HydratedDocument<Chat>;
export type MessageDocument = HydratedDocument<Message>;
export type NotificationDocument = HydratedDocument<Notification>;
export type SavedItemDocument = HydratedDocument<SavedItem>;
export type OrderDocument = HydratedDocument<Order>;
export type PaymentDocument = HydratedDocument<Payment>;

@Schema({ timestamps: true, collection: 'categories' })
export class Category {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true, unique: true, index: true })
  slug!: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  @Prop({ default: '' })
  image?: string;

  @Prop({ default: '' })
  icon?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

@Schema({ timestamps: true, collection: 'subcategories' })
export class Subcategory {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  categoryId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  slug!: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  @Prop({ default: '' })
  image?: string;

  @Prop({ default: '' })
  icon?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

@Schema({ timestamps: true, collection: 'products', strict: false })
export class Product {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Seller', required: true, index: true })
  sellerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category', index: true })
  categoryId?: Types.ObjectId;

  @Prop({ trim: true, default: 'Untitled product draft' })
  name!: string;

  @Prop({ trim: true, lowercase: true })
  slug?: string;

  @Prop({ trim: true, default: '' })
  category?: string;

  @Prop({ trim: true, default: '' })
  subcategory?: string;

  @Prop({ type: Number, default: 0, min: 0 })
  price!: number;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ type: Number, default: 1, min: 1 })
  minimumOrderQuantity!: number;

  @Prop({ default: 'units', trim: true })
  unit!: string;

  @Prop({ trim: true })
  countryOfOrigin?: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  specifications?: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({
    enum: ['draft', 'published', 'pending_review', 'rejected', 'active', 'paused'],
    default: 'draft',
    index: true,
  })
  status!: string;

  @Prop({ type: Number, default: 0, min: 0, max: 5 })
  averageRating!: number;

  @Prop({ type: Number, default: 0 })
  reviewCount!: number;
}

@Schema({ timestamps: true, collection: 'rfqs', strict: false })
export class Rfq {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  buyerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', index: true })
  productId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Seller', index: true })
  sellerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  sellerUserId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, maxlength: 3000 })
  description!: string;

  @Prop({ required: true, trim: true })
  category!: string;

  @Prop({ type: Number, required: true, min: 1 })
  quantity!: number;

  @Prop({ default: 'pcs' })
  unit!: string;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ required: true, trim: true })
  deliveryCountry!: string;

  @Prop({
    enum: [
      'active',
      'draft',
      'pending',
      'viewed',
      'replied',
      'quoted',
      'negotiating',
      'archived',
      'order_initiated',
      'converted',
      'closed',
      'rejected',
      'expired',
    ],
    default: 'pending',
    index: true,
  })
  status!: string;

  @Prop({ enum: ['public', 'private'], default: 'public' })
  visibility!: string;
}

@Schema({ timestamps: true, collection: 'quotations', strict: false })
export class Quotation {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Rfq', index: true })
  rfqId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Seller', index: true })
  sellerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  buyerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', index: true })
  productId?: Types.ObjectId;

  @Prop({ trim: true })
  title?: string;

  @Prop({ trim: true })
  status?: string;

  @Prop({ type: Number, min: 0 })
  totalPrice?: number;

  @Prop({ default: 'INR' })
  currency?: string;
}

@Schema({ timestamps: true, collection: 'chats' })
export class Chat {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  buyerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  sellerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product' })
  productId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Rfq' })
  rfqId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Quotation' })
  quotationId?: Types.ObjectId;

  @Prop({ trim: true })
  groupName?: string;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [], index: true })
  groupMembers!: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  groupOwnerId?: Types.ObjectId;

  @Prop({ default: 'general' })
  chatType!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: null })
  lastMessage?: string;

  @Prop({ default: null })
  lastMessageAt?: Date;

  @Prop({ type: Number, default: 0 })
  buyerUnreadCount!: number;

  @Prop({ type: Number, default: 0 })
  sellerUnreadCount!: number;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  orderEligibility!: Array<Record<string, unknown>>;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [], index: true })
  archivedFor!: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [], index: true })
  favoriteFor!: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [], index: true })
  pinnedFor!: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [], index: true })
  mutedFor!: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [], index: true })
  deletedFor!: Types.ObjectId[];
}

@Schema({ timestamps: true, collection: 'messages', strict: false })
export class Message {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Chat', required: true, index: true })
  chatId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  content?: string;

  @Prop({ trim: true, default: 'text' })
  messageType?: string;
}

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ trim: true })
  type?: string;

  @Prop({ default: false, index: true })
  isRead!: boolean;
}

@Schema({ timestamps: true, collection: 'saveditems' })
export class SavedItem {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['product', 'seller'], index: true })
  type!: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  itemId!: Types.ObjectId;
}

@Schema({ timestamps: true, collection: 'orders', strict: false })
export class Order {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  orderNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  buyerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Seller', required: true, index: true })
  sellerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  sellerUserId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Rfq', index: true })
  rfqId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Quotation', index: true })
  quotationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Chat', index: true })
  chatId?: Types.ObjectId;

  @Prop({ default: 'bulk', index: true })
  orderType!: string;

  @Prop({ default: 'trade_order', index: true })
  orderSubType!: string;

  @Prop({ default: 'pending_payment', index: true })
  status!: string;

  @Prop({ default: 'pending', index: true })
  paymentStatus!: string;

  @Prop({ type: Number, default: 1 })
  quantity!: number;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ type: Number, default: 0 })
  totalAmount!: number;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  products!: Array<Record<string, unknown>>;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  timeline!: Array<Record<string, unknown>>;
}

@Schema({ timestamps: true, collection: 'payments', strict: false })
export class Payment {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  orderId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  buyerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Seller', required: true, index: true })
  sellerId!: Types.ObjectId;

  @Prop({ type: Number, required: true })
  amount!: number;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ default: 'pending', index: true })
  status!: string;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
export const SubcategorySchema = SchemaFactory.createForClass(Subcategory);
export const ProductSchema = SchemaFactory.createForClass(Product);
export const RfqSchema = SchemaFactory.createForClass(Rfq);
export const QuotationSchema = SchemaFactory.createForClass(Quotation);
export const ChatSchema = SchemaFactory.createForClass(Chat);
export const MessageSchema = SchemaFactory.createForClass(Message);
export const NotificationSchema = SchemaFactory.createForClass(Notification);
export const SavedItemSchema = SchemaFactory.createForClass(SavedItem);
export const OrderSchema = SchemaFactory.createForClass(Order);
export const PaymentSchema = SchemaFactory.createForClass(Payment);

CategorySchema.index({ isActive: 1, 'metadata.sortOrder': 1, name: 1 });
CategorySchema.index({ name: 'text', slug: 'text', description: 'text', 'metadata.keywords': 'text' });
SubcategorySchema.index({ categoryId: 1, slug: 1 }, { unique: true });
SubcategorySchema.index({ categoryId: 1, isActive: 1, 'metadata.sortOrder': 1, name: 1 });
SubcategorySchema.index({ name: 'text', slug: 'text', description: 'text', 'metadata.keywords': 'text' });
ProductSchema.index({ status: 1, category: 1, subcategory: 1, createdAt: -1 });
ProductSchema.index({ status: 1, categoryId: 1, createdAt: -1 });
ProductSchema.index({ name: 'text', category: 'text', subcategory: 'text', description: 'text' });
RfqSchema.index({ visibility: 1, status: 1, createdAt: -1 });
QuotationSchema.index({ rfqId: 1, status: 1, createdAt: -1 });
ChatSchema.index({ buyerId: 1, sellerId: 1, updatedAt: -1 });
MessageSchema.index({ chatId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });
SavedItemSchema.index({ userId: 1, type: 1, itemId: 1 }, { unique: true });
SavedItemSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
PaymentSchema.index({ orderId: 1, status: 1 });
