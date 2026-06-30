import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { success } from '../common/api-response';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/request.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MarketplaceService } from './marketplace.service';

@Controller()
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('categories')
  async categories(@Query() query: Record<string, string | number | boolean | undefined>) {
    return success(await this.marketplace.listCategories(query));
  }

  @Get('products')
  async products(@Query() query: Record<string, string | number | boolean | undefined>) {
    return success(await this.marketplace.listProducts(query));
  }

  @Get('products/:productId')
  async productDetails(@Param('productId') productId: string) {
    return success(await this.marketplace.productDetails(productId));
  }

  @Get('sellers')
  async sellers(@Query() query: Record<string, string | number | boolean | undefined>) {
    return success(await this.marketplace.listSellers(query));
  }

  @Get('sellers/:sellerId')
  async sellerDetails(
    @Param('sellerId') sellerId: string,
    @Query() query: Record<string, string | number | boolean | undefined>,
  ) {
    return success(await this.marketplace.sellerDetails(sellerId, query));
  }

  @Get('search')
  async search(@Query() query: Record<string, string | number | boolean | undefined>) {
    return success(await this.marketplace.search(query));
  }

  @Get('home')
  async home(@Query() query: Record<string, string | number | boolean | undefined>) {
    return success(await this.marketplace.home(query));
  }

  @Get('categories/:categoryIdOrSlug')
  async categoryDetails(
    @Param('categoryIdOrSlug') categoryIdOrSlug: string,
    @Query() query: Record<string, string | number | boolean | undefined>,
  ) {
    return success(await this.marketplace.categoryDetails(categoryIdOrSlug, query));
  }

  @Get('rfqs')
  async rfqs(@Query() query: Record<string, string | number | boolean | undefined>) {
    return success(await this.marketplace.listRfqs(query));
  }

  @Get('rfqs/:rfqId')
  async rfqDetails(@Param('rfqId') rfqId: string) {
    return success(await this.marketplace.rfqDetails(rfqId));
  }

  @Get('quotations')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async quotations(@Query() query: Record<string, string | number | boolean | undefined>) {
    return success(await this.marketplace.listQuotations(query));
  }

  @Get('quotations/:quotationId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async quotationDetails(@Param('quotationId') quotationId: string) {
    return success(await this.marketplace.quotationDetails(quotationId));
  }

  @Get('chats')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async chats(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, string | number | boolean | undefined>,
  ) {
    return success(await this.marketplace.listChats(request.user.sub, query));
  }

  @Get('chats/:chatId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async chatDetails(
    @Req() request: AuthenticatedRequest,
    @Param('chatId') chatId: string,
    @Query() query: Record<string, string | number | boolean | undefined>,
  ) {
    return success(await this.marketplace.chatDetails(request.user.sub, chatId, query));
  }

  @Post('chats/:chatId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async sendMessage(
    @Req() request: AuthenticatedRequest,
    @Param('chatId') chatId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return success(await this.marketplace.sendMessage(request.user.sub, chatId, body));
  }

  @Get('notifications')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async notifications(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, string | number | boolean | undefined>,
  ) {
    return success(await this.marketplace.listNotifications(request.user.sub, query));
  }
}
