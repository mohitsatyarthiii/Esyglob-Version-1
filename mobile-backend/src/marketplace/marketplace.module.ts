import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Seller, SellerSchema } from '../sellers/seller.schema';
import {
  Category,
  CategorySchema,
  Chat,
  ChatSchema,
  Message,
  MessageSchema,
  Notification,
  NotificationSchema,
  Product,
  ProductSchema,
  Quotation,
  QuotationSchema,
  Rfq,
  RfqSchema,
  Subcategory,
  SubcategorySchema,
} from './catalog.schemas';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Subcategory.name, schema: SubcategorySchema },
      { name: Product.name, schema: ProductSchema },
      { name: Quotation.name, schema: QuotationSchema },
      { name: Rfq.name, schema: RfqSchema },
      { name: Chat.name, schema: ChatSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: Seller.name, schema: SellerSchema },
    ]),
  ],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
