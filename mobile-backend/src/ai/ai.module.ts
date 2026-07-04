import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Category, CategorySchema, Product, ProductSchema, Rfq, RfqSchema } from '../marketplace/catalog.schemas';
import { Seller, SellerSchema } from '../sellers/seller.schema';
import { AIController } from './ai.controller';
import { AIChat, AIChatSchema, SavedResearchReport, SavedResearchReportSchema } from './ai.schemas';
import { AIService } from './ai.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: AIChat.name, schema: AIChatSchema },
      { name: SavedResearchReport.name, schema: SavedResearchReportSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Seller.name, schema: SellerSchema },
      { name: Rfq.name, schema: RfqSchema },
    ]),
  ],
  controllers: [AIController],
  providers: [AIService],
})
export class AIModule {}
