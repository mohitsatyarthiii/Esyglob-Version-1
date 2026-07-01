import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, Req, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
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

  @Post('products')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async createProduct(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.createSellerProduct(request.user.sub, body));
  }

  @Get('products/:productId')
  async productDetails(@Param('productId') productId: string) {
    return success(await this.marketplace.productDetails(productId));
  }

  @Patch('products/:productId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async updateProduct(
    @Req() request: AuthenticatedRequest,
    @Param('productId') productId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return success(await this.marketplace.updateSellerProduct(request.user.sub, productId, body));
  }

  @Delete('products/:productId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async deleteProduct(@Req() request: AuthenticatedRequest, @Param('productId') productId: string) {
    return success(await this.marketplace.deleteSellerProduct(request.user.sub, productId));
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

  @Get('seller/onboarding')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async sellerOnboarding(@Req() request: AuthenticatedRequest) {
    return success(await this.marketplace.sellerOnboarding(request.user.sub));
  }

  @Patch('seller/onboarding')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async saveSellerOnboarding(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.saveSellerOnboardingDraft(request.user.sub, body));
  }

  @Post('seller/onboarding')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async submitSellerOnboarding(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.submitSellerOnboarding(request.user.sub, body));
  }

  @Post('seller/verification/documents')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSellerDocument(
    @Req() request: AuthenticatedRequest,
    @Body('documentType') documentType: string,
    @UploadedFile() file: any,
  ) {
    return success(await this.marketplace.uploadSellerDocument(request.user.sub, documentType, file));
  }

  @Get('seller/factory')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async factoryProfile(@Req() request: AuthenticatedRequest) {
    return success(await this.marketplace.factoryProfile(request.user.sub));
  }

  @Post('seller/factory')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async saveFactoryProfile(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.saveFactoryProfile(request.user.sub, body));
  }

  @Get('seller/products')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async sellerProducts(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, string | number | boolean | undefined>,
  ) {
    return success(await this.marketplace.listSellerProducts(request.user.sub, query));
  }

  @Get('seller/products/:productId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async sellerProductDetails(@Req() request: AuthenticatedRequest, @Param('productId') productId: string) {
    return success(await this.marketplace.sellerProductDetails(request.user.sub, productId));
  }

  @Get('rfqs')
  async rfqs(@Query() query: Record<string, string | number | boolean | undefined>) {
    return success(await this.marketplace.listRfqs(query));
  }

  @Post('rfqs')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer')
  async createRfq(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.createRfq(request.user.sub, body));
  }

  @Post('rfqs/enquiry')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer')
  async createEnquiry(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.createProductEnquiry(request.user.sub, body));
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

  @Post('quotations')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  async createQuotation(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.createQuotation(request.user.sub, body));
  }

  @Patch('quotations/:quotationId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async patchQuotation(
    @Req() request: AuthenticatedRequest,
    @Param('quotationId') quotationId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return success(await this.marketplace.patchQuotation(request.user.sub, quotationId, body));
  }

  @Put('quotations/:quotationId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async acceptQuotation(
    @Req() request: AuthenticatedRequest,
    @Param('quotationId') quotationId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return success(await this.marketplace.acceptQuotation(request.user.sub, quotationId, body));
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

  @Post('chats')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async createChat(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.createChat(request.user.sub, body));
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

  @Post('uploads/chat')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  @UseInterceptors(FileInterceptor('file'))
  async uploadChatFile(@Req() request: AuthenticatedRequest, @UploadedFile() file: any) {
    return success(await this.marketplace.saveChatUpload(request.user.sub, file));
  }

  @Post('uploads')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('seller')
  @UseInterceptors(AnyFilesInterceptor())
  async uploadFiles(@Req() request: AuthenticatedRequest, @Body('folder') folder: string, @UploadedFiles() files: any[]) {
    return success(await this.marketplace.uploadFiles(request.user.sub, folder, files));
  }

  @Get('uploads/chat/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async getChatFile(@Param('filename') filename: string, @Res() response: any) {
    const file = await this.marketplace.readChatUpload(filename);
    response.send(file);
  }

  @Get('uploads/:folder/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async getUploadedFile(@Param('folder') folder: string, @Param('filename') filename: string, @Res() response: any) {
    const file = await this.marketplace.readUpload(folder, filename);
    response.send(file);
  }

  @Patch('chats/:chatId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async patchChat(
    @Req() request: AuthenticatedRequest,
    @Param('chatId') chatId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return success(await this.marketplace.patchChat(request.user.sub, chatId, body));
  }

  @Post('checkout/quote')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async checkoutQuote(@Body() body: Record<string, unknown>) {
    return success(await this.marketplace.calculateCheckoutQuote(body));
  }

  @Post('sample-order')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer')
  async sampleOrder(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.createOrder(request.user.sub, { ...body, orderType: 'sample', orderSubType: 'sample_order' }));
  }

  @Get('orders')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async orders(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, string | number | boolean | undefined>,
  ) {
    return success(await this.marketplace.listOrders(request.user.sub, query));
  }

  @Post('orders')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer')
  async createOrder(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.createOrder(request.user.sub, body));
  }

  @Get('orders/:orderId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async orderDetails(@Req() request: AuthenticatedRequest, @Param('orderId') orderId: string) {
    return success(await this.marketplace.orderDetails(request.user.sub, orderId));
  }

  @Patch('orders/:orderId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async updateOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return success(await this.marketplace.updateOrderStatus(request.user.sub, orderId, body));
  }

  @Post('payments/initiate')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer')
  async initiatePayment(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.initiatePayment(request.user.sub, body));
  }

  @Post('payments/verify-order')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer')
  async verifyPayment(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return success(await this.marketplace.verifyPayment(request.user.sub, body));
  }

  @Get('payments/:paymentId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('buyer', 'seller')
  async paymentDetails(@Req() request: AuthenticatedRequest, @Param('paymentId') paymentId: string) {
    return success(await this.marketplace.paymentDetails(request.user.sub, paymentId));
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
