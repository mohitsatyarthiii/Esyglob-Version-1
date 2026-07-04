import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { Connection, Model, SortOrder, Types } from 'mongoose';
import { extname, join } from 'path';
import { Seller } from '../sellers/seller.schema';
import { SellerVerification } from '../sellers/seller-verification.schema';
import { User } from '../users/user.schema';
import { Category, Chat, Message, Notification, Order, Payment, Product, Quotation, Rfq, Subcategory } from './catalog.schemas';

const PRODUCT_VISIBLE_STATUSES = ['published', 'active'];
const RFQ_VISIBLE_STATUSES = ['active', 'pending', 'viewed', 'replied', 'quoted', 'negotiating'];
const UPLOAD_ROOT = join(process.cwd(), 'uploads');
const UPLOAD_DIR = join(UPLOAD_ROOT, 'chat');

type QueryValue = string | number | boolean | undefined;

@Injectable()
export class MarketplaceService {
  constructor(
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    @InjectModel(Subcategory.name) private readonly subcategories: Model<Subcategory>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Quotation.name) private readonly quotations: Model<Quotation>,
    @InjectModel(Rfq.name) private readonly rfqs: Model<Rfq>,
    @InjectModel(Chat.name) private readonly chats: Model<Chat>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Seller.name) private readonly sellers: Model<Seller>,
    @InjectModel(SellerVerification.name) private readonly sellerVerifications: Model<SellerVerification>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async listCategories(query: Record<string, QueryValue>) {
    const filter: Record<string, unknown> = { isActive: { $ne: false } };
    const q = this.clean(query.q);

    if (q) {
      filter.$or = [
        { name: this.regex(q) },
        { slug: this.regex(q) },
        { description: this.regex(q) },
        { 'metadata.keywords': this.regex(q) },
      ];
    }

    const categories = await this.categories
      .find(filter)
      .sort({ 'metadata.sortOrder': 1, name: 1 })
      .limit(this.limit(query.limit, 100))
      .lean();

    const categoryIds = categories.map(category => category._id);
    const [subcategories, productCounts] = await Promise.all([
      this.subcategories
        .find({ categoryId: { $in: categoryIds }, isActive: { $ne: false } })
        .sort({ 'metadata.sortOrder': 1, name: 1 })
        .lean(),
      this.products.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { status: { $in: PRODUCT_VISIBLE_STATUSES }, categoryId: { $in: categoryIds } } },
        { $group: { _id: '$categoryId', count: { $sum: 1 } } },
      ]),
    ]);
    const subcategoriesByCategory = new Map<string, unknown[]>();
    const countByCategory = new Map(productCounts.map(item => [item._id.toString(), item.count]));

    for (const subcategory of subcategories) {
      const key = subcategory.categoryId.toString();
      subcategoriesByCategory.set(key, [...(subcategoriesByCategory.get(key) ?? []), subcategory]);
    }

    return {
      categories: categories.map(category => ({
        ...category,
        subcategories: subcategoriesByCategory.get(category._id.toString()) ?? [],
        productCount: countByCategory.get(category._id.toString()) ?? 0,
      })),
    };
  }

  async listProducts(query: Record<string, QueryValue>) {
    const filter = await this.productFilter(query);
    const sort = this.productSort(query.sort);
    const limit = this.limit(query.limit, 50);
    const page = this.page(query.page);
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.products
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('sellerId', 'userId companyName businessName displayName country verificationStatus isVerified')
        .lean(),
      this.products.countDocuments(filter),
    ]);

    return {
      products: products.map(product => this.serializeProduct(product)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async search(query: Record<string, QueryValue>) {
    const q = this.clean(query.q);

    if (!q || q.length < 2) {
      return { products: [], categories: [] };
    }

    const [productResult, categoryResult] = await Promise.all([
      this.listProducts({ ...query, q, limit: query.limit ?? 20 }),
      this.listCategories({ q, limit: 10 }),
    ]);

    return {
      products: productResult.products,
      categories: categoryResult.categories,
    };
  }

  async productDetails(productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new BadRequestException('Invalid product id.');
    }

    const product = await this.products
      .findOne({ _id: new Types.ObjectId(productId), status: { $in: PRODUCT_VISIBLE_STATUSES } })
      .populate('sellerId', 'userId companyName businessName displayName address country verificationStatus isVerified trustScore rating')
      .populate('categoryId', 'name slug image icon')
      .lean();

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    return { product: this.serializeProduct(product) };
  }

  async listSellers(query: Record<string, QueryValue>) {
    const filter: Record<string, unknown> = {};
    const q = this.clean(query.q ?? query.search);
    const isVerified = String(query.isVerified ?? '').toLowerCase() === 'true';
    const minRating = Number(query.minRating);
    const limit = this.limit(query.limit, 50);
    const page = this.page(query.page);
    const skip = (page - 1) * limit;

    if (q) {
      filter.$or = [
        { companyName: this.regex(q) },
        { businessName: this.regex(q) },
        { displayName: this.regex(q) },
        { description: this.regex(q) },
        { companyIntroduction: this.regex(q) },
        { mainCategories: this.regex(q) },
      ];
    }

    if (isVerified) {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        { $or: [{ isVerified: true }, { verificationStatus: 'verified' }] },
      ];
    }

    if (Number.isFinite(minRating)) {
      filter.rating = { $gte: minRating };
    }

    const sort = this.sellerSort(query.sort);
    const [sellers, total] = await Promise.all([
      this.sellers.find(filter).sort(sort).skip(skip).limit(limit).populate('userId', 'name fullName email').lean(),
      this.sellers.countDocuments(filter),
    ]);
    const sellerIds = sellers.map(seller => seller._id);
    const productCounts = await this.products.aggregate<{
      _id: Types.ObjectId;
      count: number;
      categories: string[];
      images: string[];
      minMoq?: number;
    }>([
      { $match: { status: { $in: PRODUCT_VISIBLE_STATUSES }, sellerId: { $in: sellerIds } } },
      {
        $group: {
          _id: '$sellerId',
          count: { $sum: 1 },
          categories: { $addToSet: '$category' },
          images: { $push: { $first: '$images' } },
          minMoq: { $min: '$minimumOrderQuantity' },
        },
      },
    ]);
    const productMeta = new Map(productCounts.map(item => [item._id.toString(), item]));

    return {
      sellers: sellers.map(seller => this.serializeSeller(seller, productMeta.get(seller._id.toString()))),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async sellerDetails(sellerId: string, query: Record<string, QueryValue>) {
    const seller = await this.findSeller(sellerId);

    if (!seller) {
      throw new NotFoundException('Seller not found.');
    }

    const [products, factoryProfile, verification, reviews] = await Promise.all([
      this.listProducts({ ...query, seller: seller._id.toString(), limit: query.limit ?? 12 }),
      this.connection.collection('factoryprofiles').findOne({ sellerId: seller._id }),
      this.connection.collection('sellerverifications').findOne({ sellerId: seller._id }),
      this.connection.collection('reviews').find({ sellerId: seller._id }).sort({ createdAt: -1 }).limit(5).toArray(),
    ]);

    return {
      seller: this.serializeSeller(seller, {
        _id: seller._id,
        count: products.pagination?.total ?? products.products.length,
        categories: Array.from(new Set(products.products.map(product => (product as Record<string, any>).category).filter(Boolean))) as string[],
        images: products.products.map(product => (product as Record<string, any>).image).filter(Boolean) as string[],
      }),
      factoryProfile,
      verification,
      products: products.products,
      pagination: products.pagination,
      reviews,
    };
  }

  async categoryDetails(categoryIdOrSlug: string, query: Record<string, QueryValue>) {
    const filter = Types.ObjectId.isValid(categoryIdOrSlug)
      ? { _id: new Types.ObjectId(categoryIdOrSlug), isActive: { $ne: false } }
      : { slug: categoryIdOrSlug.toLowerCase(), isActive: { $ne: false } };
    const category = await this.categories.findOne(filter).lean();

    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    const [subcategories, products] = await Promise.all([
      this.subcategories
        .find({ categoryId: category._id, isActive: { $ne: false } })
        .sort({ 'metadata.sortOrder': 1, name: 1 })
        .lean(),
      this.listProducts({ ...query, category: category._id.toString() }),
    ]);

    return {
      category: {
        ...category,
        subcategories,
      },
      ...products,
    };
  }

  async sellerOnboarding(userId: string) {
    const seller = await this.ensureSellerProfile(userId);
    const verification = await this.ensureSellerVerification(seller);

    return {
      seller,
      verification,
      draftAvailable: Boolean((seller as Record<string, any>).onboardingDraftSavedAt),
      completion: this.sellerCompletion(seller),
    };
  }

  async saveSellerOnboardingDraft(userId: string, body: Record<string, unknown>) {
    const seller = await this.ensureSellerProfile(userId);
    const update = this.sellerOnboardingPayload(body, false);
    const saved = await this.sellers.findByIdAndUpdate(
      seller._id,
      {
        $set: {
          ...update,
          onboardingDraftSavedAt: new Date(),
          verificationStatus: seller.verificationStatus === 'approved' ? seller.verificationStatus : seller.verificationStatus ?? 'pending',
        },
      },
      { new: true },
    ).lean();

    const verification = await this.ensureSellerVerification(saved ?? seller);
    await this.updateVerificationCompletion(verification._id, saved ?? seller);

    return {
      success: true,
      seller: saved,
      verification: await this.sellerVerifications.findById(verification._id).lean(),
      draftSavedAt: new Date(),
      completion: this.sellerCompletion(saved ?? seller),
    };
  }

  async submitSellerOnboarding(userId: string, body: Record<string, unknown>) {
    const seller = await this.ensureSellerProfile(userId);
    const update = this.sellerOnboardingPayload(body, true);
    const saved = await this.sellers.findByIdAndUpdate(
      seller._id,
      {
        $set: {
          ...update,
          isActive: true,
          verificationStatus: 'under_review',
          onboardingSubmittedAt: new Date(),
        },
      },
      { new: true },
    ).lean();
    const verification = await this.ensureSellerVerification(saved ?? seller);
    const documents = Array.isArray(verification.documents) ? verification.documents : [];

    await this.sellerVerifications.updateOne(
      { _id: verification._id },
      {
        $set: {
          status: documents.length ? 'document_submitted' : 'pending',
          onboardingCompleted: true,
          submittedAt: new Date(),
          ...this.sellerCompletion(saved ?? seller),
        },
      },
    );
    await this.users.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { hasCompletedOnboarding: true } });

    return { success: true, sellerId: seller._id.toString(), redirectTo: '/dashboard/seller', seller: saved };
  }

  async uploadSellerDocument(userId: string, documentType: string, file: any) {
    if (!documentType) {
      throw new BadRequestException('Document type is required.');
    }

    const seller = await this.ensureSellerProfile(userId);
    const verification = await this.ensureSellerVerification(seller);
    const saved = await this.saveUploadFile(file, 'verification');
    const document = {
      ...saved,
      documentType,
      status: 'pending',
      uploadedAt: new Date(),
    };

    await this.sellerVerifications.updateOne(
      { _id: verification._id },
      {
        $push: { documents: document },
        $set: { status: 'document_submitted' },
      },
    );
    await this.sellers.updateOne({ _id: seller._id }, { $set: { verificationStatus: 'document_submitted' } });

    return { success: true, document };
  }

  async factoryProfile(userId: string) {
    const seller = await this.ensureSellerProfile(userId);
    const factoryProfile = await this.connection.collection('factoryprofiles').findOne({ sellerId: seller._id });

    return { seller, factoryProfile };
  }

  async saveFactoryProfile(userId: string, body: Record<string, unknown>) {
    const seller = await this.ensureSellerProfile(userId);
    const now = new Date();
    const update = {
      sellerId: seller._id,
      userId: new Types.ObjectId(userId),
      ...body,
      status: body.status ?? 'pending',
      updatedAt: now,
    };

    await this.connection.collection('factoryprofiles').updateOne(
      { sellerId: seller._id },
      { $set: update, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    await this.sellers.updateOne(
      { _id: seller._id },
      {
        $set: {
          factoryVerified: false,
          factoryProfileCompleted: true,
          factoryImages: Array.isArray(body.images) ? body.images : (seller as Record<string, any>).factoryImages,
        },
      },
    );

    return { success: true, factoryProfile: await this.connection.collection('factoryprofiles').findOne({ sellerId: seller._id }) };
  }

  async uploadFiles(userId: string, folder: string, files: any[]) {
    await this.ensureSellerProfile(userId);
    const safeFolder = ['products', 'verification', 'factory', 'chat'].includes(folder) ? folder : 'general';
    if (!files?.length) {
      throw new BadRequestException('At least one file is required.');
    }
    const uploads = await Promise.all((files ?? []).map(file => this.saveUploadFile(file, safeFolder)));

    return { uploads };
  }

  async listSellerProducts(userId: string, query: Record<string, QueryValue>) {
    const seller = await this.ensureSellerProfile(userId);
    const filter: Record<string, unknown> = { sellerId: seller._id };
    const q = this.clean(query.q);

    if (q) {
      filter.$or = [{ name: this.regex(q) }, { category: this.regex(q) }, { subcategory: this.regex(q) }, { status: this.regex(q) }];
    }

    if (query.status) {
      filter.status = this.exactRegex(String(query.status));
    }

    const limit = this.limit(query.limit, 30);
    const page = this.page(query.page);
    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
      this.products.find(filter).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.products.countDocuments(filter),
    ]);

    return { products: products.map(product => this.serializeProduct(product)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async sellerProductDetails(userId: string, productId: string) {
    const seller = await this.ensureSellerProfile(userId);
    const objectId = this.requireObjectId(productId, 'Product id');
    const product = await this.products.findOne({ _id: objectId, $or: [{ userId: new Types.ObjectId(userId) }, { sellerId: seller._id }] }).lean();

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    return { product: this.serializeProduct(product) };
  }

  async createSellerProduct(userId: string, body: Record<string, unknown>) {
    const seller = await this.ensureSellerProfile(userId);
    const payload = await this.productPayload(body, seller, userId);
    const product = await this.products.create(payload);
    await this.sellers.updateOne({ _id: seller._id }, { $inc: { totalProducts: 1 } });
    await this.upsertProductMapping(product.toObject());

    return { product: this.serializeProduct(product.toObject()), redirectTo: '/dashboard/products', visibilityNotice: this.visibilityNotice(product.status, seller) };
  }

  async updateSellerProduct(userId: string, productId: string, body: Record<string, unknown>) {
    const seller = await this.ensureSellerProfile(userId);
    const objectId = this.requireObjectId(productId, 'Product id');
    const existing = await this.products.findOne({ _id: objectId, $or: [{ userId: new Types.ObjectId(userId) }, { sellerId: seller._id }] });

    if (!existing) {
      throw new NotFoundException('Product not found.');
    }

    const payload = await this.productPayload(body, seller, userId);
    Object.assign(existing, payload);
    await existing.save();
    await this.connection.collection('productcategorymappings').deleteMany({ productId: existing._id });
    await this.upsertProductMapping(existing.toObject());

    return { success: true, product: this.serializeProduct(existing.toObject()), visibilityNotice: this.visibilityNotice(existing.status, seller) };
  }

  async deleteSellerProduct(userId: string, productId: string) {
    const seller = await this.ensureSellerProfile(userId);
    const objectId = this.requireObjectId(productId, 'Product id');
    const deleted = await this.products.findOneAndDelete({ _id: objectId, $or: [{ userId: new Types.ObjectId(userId) }, { sellerId: seller._id }] });

    if (!deleted) {
      throw new NotFoundException('Product not found.');
    }

    await this.connection.collection('productcategorymappings').deleteMany({ productId: objectId });
    await this.sellers.updateOne({ _id: seller._id }, { $inc: { totalProducts: -1 } });

    return { success: true };
  }

  async listRfqs(query: Record<string, QueryValue>) {
    const filter: Record<string, unknown> = {
      visibility: 'public',
      status: { $in: RFQ_VISIBLE_STATUSES },
    };
    const q = this.clean(query.q);
    const category = this.clean(query.category);

    if (q) {
      filter.$or = [{ title: this.regex(q) }, { description: this.regex(q) }, { category: this.regex(q) }];
    }

    if (category) {
      filter.category = this.exactRegex(category);
    }

    const rfqs = await this.rfqs
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(this.limit(query.limit, 50))
      .lean();

    return {
      rfqs: rfqs.map(rfq => ({
        ...rfq,
        destinationCountry: rfq.deliveryCountry,
      })),
    };
  }

  async rfqDetails(rfqId: string) {
    if (!Types.ObjectId.isValid(rfqId)) {
      throw new BadRequestException('Invalid RFQ id.');
    }

    const rfq = await this.rfqs
      .findById(rfqId)
      .populate('productId', 'name slug images price currency minimumOrderQuantity unit')
      .populate('sellerId', 'companyName businessName displayName country verificationStatus isVerified rating')
      .lean();

    if (!rfq) {
      throw new NotFoundException('RFQ not found.');
    }

    const [quotations, chats] = await Promise.all([
      this.quotations
        .find({ rfqId: rfq._id })
        .sort({ createdAt: -1 })
        .populate('sellerId', 'companyName businessName displayName country verificationStatus isVerified rating')
        .populate('productId', 'name slug images price currency')
        .lean(),
      this.chats.find({ rfqId: rfq._id, isActive: { $ne: false } }).sort({ updatedAt: -1 }).limit(10).lean(),
    ]);

    return {
      rfq: {
        ...rfq,
        destinationCountry: rfq.deliveryCountry,
      },
      quotations,
      chats,
    };
  }

  async listQuotations(query: Record<string, QueryValue>) {
    const filter: Record<string, unknown> = {};
    const rfqId = this.clean(query.rfqId);
    const status = this.clean(query.status);
    const limit = this.limit(query.limit, 50);
    const page = this.page(query.page);
    const skip = (page - 1) * limit;

    if (rfqId) {
      if (!Types.ObjectId.isValid(rfqId)) {
        throw new BadRequestException('Invalid RFQ id.');
      }

      filter.rfqId = new Types.ObjectId(rfqId);
    }

    if (status) {
      filter.status = this.exactRegex(status);
    }

    const [quotations, total] = await Promise.all([
      this.quotations
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sellerId', 'companyName businessName displayName country verificationStatus isVerified rating')
        .populate('productId', 'name slug images price currency minimumOrderQuantity unit')
        .populate('rfqId', 'title quantity unit deliveryCountry status')
        .lean(),
      this.quotations.countDocuments(filter),
    ]);

    return {
      quotations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async quotationDetails(quotationId: string) {
    if (!Types.ObjectId.isValid(quotationId)) {
      throw new BadRequestException('Invalid quotation id.');
    }

    const quotation = await this.quotations
      .findById(quotationId)
      .populate('sellerId', 'companyName businessName displayName country verificationStatus isVerified rating')
      .populate('productId', 'name slug images price currency minimumOrderQuantity unit')
      .populate('rfqId', 'title description quantity unit deliveryCountry status')
      .lean();

    if (!quotation) {
      throw new NotFoundException('Quotation not found.');
    }

    return { quotation };
  }

  async listChats(userId: string, query: Record<string, QueryValue>) {
    const objectId = new Types.ObjectId(userId);
    const chats = await this.chats
      .find({
        isActive: { $ne: false },
        $or: [{ buyerId: objectId }, { sellerId: objectId }, { groupMembers: objectId }],
      })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(this.limit(query.limit, 50))
      .populate('buyerId', 'name fullName email profileImage avatar image')
      .populate('sellerId', 'name fullName email profileImage avatar image')
      .populate('productId', 'name slug images price currency minimumOrderQuantity unit status')
      .populate('rfqId', 'title quantity unit deliveryCountry status')
      .lean();

    return { chats };
  }

  async chatDetails(userId: string, chatId: string, query: Record<string, QueryValue>) {
    if (!Types.ObjectId.isValid(chatId)) {
      throw new BadRequestException('Invalid chat id.');
    }

    const objectId = new Types.ObjectId(userId);
    const chat = await this.chats
      .findOne({
        _id: new Types.ObjectId(chatId),
        isActive: { $ne: false },
        $or: [{ buyerId: objectId }, { sellerId: objectId }, { groupMembers: objectId }],
      })
      .populate('buyerId', 'name fullName email profileImage avatar image')
      .populate('sellerId', 'name fullName email profileImage avatar image')
      .populate('productId', 'name slug images price currency minimumOrderQuantity unit status')
      .populate('rfqId', 'title quantity unit deliveryCountry status')
      .lean();

    if (!chat) {
      throw new NotFoundException('Chat not found.');
    }

    const messages = await this.messages
      .find({ chatId: chat._id })
      .sort({ createdAt: 1 })
      .limit(this.limit(query.limit, 100))
      .populate('senderId', 'name fullName email profileImage avatar image')
      .lean();
    const sellerProfile = await this.sellers.findOne({ userId: chat.sellerId }).lean();
    const sellerProducts = sellerProfile
      ? await this.products.find({ sellerId: sellerProfile._id, status: { $in: PRODUCT_VISIBLE_STATUSES } }).limit(12).lean()
      : [];
    const rfqProducts = chat.rfqId
      ? await this.products.find({ _id: { $in: [chat.productId].filter(Boolean) } }).limit(10).lean()
      : [];

    if (String(query.markRead) !== 'false') {
      const readField = chat.buyerId?.toString() === userId ? 'buyerUnreadCount' : 'sellerUnreadCount';
      await this.chats.updateOne({ _id: chat._id }, { $set: { [readField]: 0 } });
    }

    return { chat, messages, sellerProfile, sellerProducts: sellerProducts.map(product => this.serializeProduct(product)), rfqProducts: rfqProducts.map(product => this.serializeProduct(product)) };
  }

  async sendMessage(userId: string, chatId: string, body: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(chatId)) {
      throw new BadRequestException('Invalid chat id.');
    }

    const text = typeof body.content === 'string' ? body.content.trim() : typeof body.text === 'string' ? body.text.trim() : '';
    const messageType = typeof body.messageType === 'string' ? body.messageType : 'text';
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!text && !attachments.length && !body.productDetails && !body.orderDetails && !body.rfqDetails && !body.quotationDetails && !body.storeDetails) {
      throw new BadRequestException('Message content is required.');
    }

    const objectId = new Types.ObjectId(userId);
    const chat = await this.chats.findOne({
      _id: new Types.ObjectId(chatId),
      isActive: { $ne: false },
      $or: [{ buyerId: objectId }, { sellerId: objectId }, { groupMembers: objectId }],
    });

    if (!chat) {
      throw new NotFoundException('Chat not found.');
    }

    const message = await this.messages.create({
      chatId: chat._id,
      senderId: objectId,
      content: text,
      messageType,
      attachments,
      productDetails: body.productDetails,
      orderDetails: body.orderDetails,
      rfqDetails: body.rfqDetails,
      quotationDetails: body.quotationDetails,
      storeDetails: body.storeDetails,
    });
    const receiverId = chat.buyerId.toString() === userId ? chat.sellerId : chat.buyerId;
    const unreadField = chat.buyerId.toString() === userId ? 'sellerUnreadCount' : 'buyerUnreadCount';

    await this.chats.updateOne(
      { _id: chat._id },
      {
        $set: {
          lastMessage: text || `${messageType} message`,
          lastMessageAt: new Date(),
        },
        $inc: { [unreadField]: 1 },
      },
    );
    await this.notifications.create({
      userId: receiverId,
      title: 'New message',
      message: text || `New ${messageType} message`,
      type: 'message',
      relatedModel: 'Chat',
      relatedId: chat._id,
    });

    return { message: message.toObject() };
  }

  async saveChatUpload(userId: string, file: any) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload file is required.');
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const extension = extname(String(file.originalname ?? '')).toLowerCase() || this.extensionForMime(String(file.mimetype ?? ''));
    const filename = `${new Types.ObjectId(userId).toString()}-${Date.now()}-${randomUUID()}${extension}`;
    await writeFile(join(UPLOAD_DIR, filename), file.buffer);

    return {
      attachment: {
        id: filename,
        url: `/api/uploads/chat/${filename}`,
        name: file.originalname ?? filename,
        mimeType: file.mimetype ?? 'application/octet-stream',
        size: file.size ?? file.buffer.length,
      },
    };
  }

  async readChatUpload(filename: string) {
    if (!/^[a-f0-9]{24}-\d+-[a-f0-9-]+\.[a-z0-9]+$/i.test(filename)) {
      throw new BadRequestException('Invalid upload filename.');
    }

    return readFile(join(UPLOAD_DIR, filename));
  }

  async readUpload(folder: string, filename: string) {
    if (!['products', 'verification', 'factory', 'general'].includes(folder) || !/^\d+-[a-f0-9-]+\.[a-z0-9]+$/i.test(filename)) {
      throw new BadRequestException('Invalid upload path.');
    }

    return readFile(join(UPLOAD_ROOT, folder, filename));
  }

  async createChat(userId: string, body: Record<string, unknown>) {
    const otherUserId = this.requireObjectId(body.otherUserId, 'Supplier user id');
    const productId = this.optionalObjectId(body.productId);
    const rfqId = this.optionalObjectId(body.rfqId);
    const quotationId = this.optionalObjectId(body.quotationId);
    const buyerId = new Types.ObjectId(userId);
    const seller = await this.sellers.findOne({ userId: otherUserId }).lean();

    if (!seller) {
      throw new BadRequestException('Supplier user was not found.');
    }

    if (productId) {
      const product = await this.products.findOne({ _id: productId, sellerId: seller._id }).lean();
      if (!product) {
        throw new BadRequestException('Product does not belong to the selected supplier.');
      }
    }

    return this.findOrCreateConversation({
      buyerId,
      sellerUserId: otherUserId,
      productId,
      rfqId,
      quotationId,
      chatType: rfqId ? 'rfq_negotiation' : 'product_inquiry',
    });
  }

  async createProductEnquiry(userId: string, body: Record<string, unknown>) {
    const buyerId = new Types.ObjectId(userId);
    const productId = this.requireObjectId(body.productId, 'Product id');
    const sellerUserId = this.requireObjectId(body.sellerUserId, 'Supplier user id');
    const product = await this.products.findById(productId).lean();

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    const seller = await this.sellers.findOne({ userId: sellerUserId }).lean();

    if (!seller) {
      throw new BadRequestException('Supplier was not found.');
    }

    if (product.sellerId?.toString() !== seller._id.toString()) {
      throw new BadRequestException('Product does not belong to this supplier.');
    }

    const quantity = Math.max(Number(body.quantity ?? product.minimumOrderQuantity ?? 1) || 1, 1);
    const destinationCountry = String(body.destinationCountry ?? '').trim();

    if (!destinationCountry) {
      throw new BadRequestException('Destination country is required.');
    }

    const rfq = await this.rfqs.create({
      buyerId,
      productId,
      sellerId: seller._id,
      sellerUserId,
      rfqType: 'product',
      visibility: 'private',
      status: 'active',
      specificSupplierIds: [seller._id],
      title: String(body.productName ?? product.name ?? 'Product enquiry'),
      description: String(body.additionalNotes ?? body.customSpecifications ?? product.description ?? 'Buyer created a product enquiry.'),
      category: product.category ?? 'Product',
      quantity,
      unit: String(body.unit ?? product.unit ?? 'pcs'),
      targetPrice: body.targetPrice,
      currency: product.currency ?? 'INR',
      deliveryCountry: destinationCountry,
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      items: [{
        productId,
        productName: body.productName ?? product.name,
        quantity,
        unit: body.unit ?? product.unit ?? 'pcs',
        targetPrice: body.targetPrice,
      }],
      customSpecifications: body.customSpecifications,
      customizationRequirements: body.customizationRequirements,
      packagingRequirements: body.packagingRequirements,
      deliveryRequirements: body.deliveryRequirements,
      additionalNotes: body.additionalNotes,
    });
    const conversation = await this.findOrCreateConversation({
      buyerId,
      sellerUserId,
      productId,
      rfqId: rfq._id,
      chatType: 'rfq_negotiation',
    });
    const content = `RFQ created for ${product.name ?? 'product'}: ${quantity} ${body.unit ?? product.unit ?? 'pcs'} to ${destinationCountry}.`;
    await this.messages.create({
      chatId: conversation.chat._id,
      senderId: buyerId,
      content,
      messageType: 'rfq',
      rfqDetails: rfq.toObject(),
      productDetails: product,
    });
    await this.messages.create({
      chatId: conversation.chat._id,
      senderId: sellerUserId,
      content: 'Thanks for your enquiry. The supplier can review the RFQ and send a quotation.',
      messageType: 'system',
      rfqDetails: rfq.toObject(),
    });
    await this.chats.updateOne(
      { _id: conversation.chat._id },
      {
        $set: { lastMessage: 'New RFQ enquiry created', lastMessageAt: new Date() },
        $inc: { sellerUnreadCount: 1 },
      },
    );
    await this.notifications.create({
      userId: sellerUserId,
      title: 'New private RFQ received',
      message: content,
      type: 'rfq_created',
      notificationType: 'rfq_created',
      relatedModel: 'RFQ',
      relatedId: rfq._id,
      actionUrl: `/dashboard/seller/rfqs/${rfq._id.toString()}`,
    });

    return {
      rfq: rfq.toObject(),
      chat: await this.populateChat(conversation.chat._id),
      message: 'RFQ enquiry created successfully',
    };
  }

  async createRfq(userId: string, body: Record<string, unknown>) {
    const productId = this.optionalObjectId(body.productId);
    const product = productId ? await this.products.findById(productId).lean() : null;
    const quantity = Math.max(Number(body.quantity ?? 1) || 1, 1);
    const deliveryCountry = String(body.destinationCountry ?? body.deliveryCountry ?? '').trim();

    if (!deliveryCountry) {
      throw new BadRequestException('Destination country is required.');
    }

    const rfq = await this.rfqs.create({
      buyerId: new Types.ObjectId(userId),
      productId,
      title: String(body.title ?? body.productName ?? product?.name ?? 'RFQ'),
      description: String(body.description ?? body.additionalNotes ?? 'Buyer created an RFQ.'),
      category: String(body.category ?? product?.category ?? 'General'),
      quantity,
      unit: String(body.unit ?? product?.unit ?? 'pcs'),
      targetPrice: body.targetPrice,
      currency: body.currency ?? product?.currency ?? 'INR',
      deliveryCountry,
      status: 'active',
      visibility: body.visibility === 'private' ? 'private' : 'public',
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
    });

    return { rfq: rfq.toObject() };
  }

  async patchChat(userId: string, chatId: string, body: Record<string, unknown>) {
    if (body.action !== 'enable_order') {
      throw new BadRequestException('Unsupported chat action.');
    }

    const productId = this.requireObjectId(body.productId, 'Product id');
    const sellerUserId = new Types.ObjectId(userId);
    const chat = await this.chats.findOne({ _id: this.requireObjectId(chatId, 'Chat id'), sellerId: sellerUserId, isActive: { $ne: false } }).lean();

    if (!chat) {
      throw new ForbiddenException('Only the seller in this conversation can enable Start Order.');
    }

    const seller = await this.sellers.findOne({ userId: sellerUserId, verificationStatus: { $ne: 'suspended' } }).lean();

    if (!seller) {
      throw new BadRequestException('Seller profile is not active.');
    }

    const product = await this.products.findOne({ _id: productId, sellerId: seller._id, status: { $in: PRODUCT_VISIBLE_STATUSES } }).lean();

    if (!product) {
      throw new BadRequestException('Product does not belong to the seller or is not active.');
    }

    const rfq = await this.rfqs.findOne({
      buyerId: chat.buyerId,
      sellerUserId,
      productId,
      status: { $in: RFQ_VISIBLE_STATUSES },
    }).lean();

    if (!rfq) {
      throw new ConflictException('An RFQ is required before Start Order can be enabled.');
    }

    const eligibility = {
      productId,
      enabledBy: sellerUserId,
      enabledAt: new Date(),
      isActive: true,
    };
    const actionUrl = `/dashboard/buyer/trade-order?chatId=${chat._id.toString()}&productId=${productId.toString()}`;
    const message = await this.messages.create({
      chatId: chat._id,
      senderId: sellerUserId,
      content: 'Seller enabled Start Order for this product.',
      messageType: 'action',
      actionType: 'start_order',
      orderDetails: { actionUrl, productId },
      productDetails: product,
    });

    await this.chats.updateOne(
      { _id: chat._id },
      {
        $set: {
          productId,
          rfqId: rfq._id,
          lastMessage: 'Start Order enabled',
          lastMessageAt: new Date(),
        },
        $pull: { orderEligibility: { productId } },
        $inc: { buyerUnreadCount: 1 },
      },
    );
    await this.chats.updateOne({ _id: chat._id }, { $push: { orderEligibility: eligibility } });
    await this.notifications.create({
      userId: chat.buyerId,
      title: 'Start Order enabled',
      message: 'The seller enabled trade order checkout for your RFQ.',
      type: 'start_order',
      relatedModel: 'Chat',
      relatedId: chat._id,
      actionUrl,
    });

    return { chat: await this.populateChat(chat._id), message: message.toObject() };
  }

  async createQuotation(userId: string, body: Record<string, unknown>) {
    const rfqId = this.requireObjectId(body.rfqId, 'RFQ id');
    const sellerUserId = new Types.ObjectId(userId);
    const seller = await this.sellers.findOne({ userId: sellerUserId }).lean();
    const rfq = await this.rfqs.findById(rfqId).lean();

    if (!seller || !rfq) {
      throw new NotFoundException('RFQ or seller was not found.');
    }

    const unitPrice = Number(body.unitPrice ?? 0) || 0;
    const suppliedQuantity = Number(body.suppliedQuantity ?? rfq.quantity ?? 1) || 1;
    const quotation = await this.quotations.create({
      ...body,
      rfqId,
      sellerId: seller._id,
      buyerId: rfq.buyerId,
      productId: rfq.productId,
      status: 'sent',
      currency: body.currency ?? rfq.currency ?? 'INR',
      unitPrice,
      quantity: suppliedQuantity,
      totalPrice: Number(body.totalPrice ?? unitPrice * suppliedQuantity) || 0,
      title: body.title ?? rfq.title,
    });
    await this.rfqs.updateOne(
      { _id: rfq._id },
      {
        $set: { status: 'quoted' },
        $inc: { quotationCount: 1 },
        $addToSet: { repliedBySellerIds: seller._id },
      },
    );
    const conversation = await this.findOrCreateConversation({
      buyerId: rfq.buyerId,
      sellerUserId,
      productId: rfq.productId,
      rfqId,
      quotationId: quotation._id,
      chatType: 'rfq_negotiation',
    });
    await this.messages.create({
      chatId: conversation.chat._id,
      senderId: sellerUserId,
      content: String(body.sellerMessage ?? body.notes ?? 'Seller sent a quotation.'),
      messageType: 'quotation',
      quotationDetails: quotation.toObject(),
    });
    await this.notifications.create({
      userId: rfq.buyerId,
      title: 'New quotation received',
      message: 'A seller responded to your RFQ.',
      type: 'quotation_created',
      relatedModel: 'Quotation',
      relatedId: quotation._id,
    });

    return { quotation: quotation.toObject(), chat: await this.populateChat(conversation.chat._id) };
  }

  async patchQuotation(userId: string, quotationId: string, body: Record<string, unknown>) {
    const quotation = await this.quotations.findById(this.requireObjectId(quotationId, 'Quotation id'));

    if (!quotation) {
      throw new NotFoundException('Quotation not found.');
    }

    const action = String(body.action ?? '');
    const update: Record<string, unknown> = {};

    if (action === 'request_revision') {
      update.status = 'revision_requested';
      update.revisionReason = body.reason;
    } else if (action === 'counter_offer') {
      update.status = 'counter_offered';
      update.counterOffer = body;
    } else {
      Object.assign(update, body);
      delete update.action;
    }

    Object.assign(quotation, update);
    await quotation.save();

    const quotationRecord = quotation as typeof quotation & { chatId?: Types.ObjectId };

    if (quotationRecord.chatId) {
      await this.messages.create({
        chatId: quotationRecord.chatId,
        senderId: new Types.ObjectId(userId),
        content: action ? `Quotation ${action.replace(/_/g, ' ')}.` : 'Quotation updated.',
        messageType: 'quotation',
        quotationDetails: quotation.toObject(),
      });
    }

    return { quotation: quotation.toObject() };
  }

  async acceptQuotation(userId: string, quotationId: string, body: Record<string, unknown>) {
    const quotation = await this.quotations.findById(this.requireObjectId(quotationId, 'Quotation id')).lean();

    if (!quotation) {
      throw new NotFoundException('Quotation not found.');
    }

    const quotationRecord = quotation as typeof quotation & { chatId?: Types.ObjectId; orderId?: Types.ObjectId; quantity?: number };
    const existingOrder = quotationRecord.orderId ? await this.orders.findById(quotationRecord.orderId).lean() : null;
    const order = existingOrder ?? (await this.createOrder(userId, {
      ...body,
      productId: quotation.productId,
      rfqId: quotation.rfqId,
      quotationId: quotation._id,
      chatId: quotationRecord.chatId,
      quantity: quotationRecord.quantity ?? 1,
      orderType: 'bulk',
      orderSubType: 'trade_order',
      status: 'pending_approval',
      paymentRequired: false,
    })).order;

    if (!order) {
      throw new BadRequestException('Order could not be created from quotation.');
    }

    await this.quotations.updateOne({ _id: quotation._id }, { $set: { status: 'accepted', orderId: order._id } });
    if (quotation.rfqId) {
      await this.rfqs.updateOne(
        { _id: quotation.rfqId },
        { $set: { status: 'converted', acceptedQuotationId: quotation._id, tradeOrderId: order._id } },
      );
      await this.quotations.updateMany(
        { rfqId: quotation.rfqId, _id: { $ne: quotation._id } },
        { $set: { status: 'lost' } },
      );
    }

    return { quotation: { ...quotation, status: 'accepted', orderId: order } };
  }

  async calculateCheckoutQuote(body: Record<string, unknown>) {
    const productId = this.requireObjectId(body.productId, 'Product id');
    const product = await this.products.findById(productId).lean();

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    const quantity = Math.max(Number(body.quantity ?? 1) || 1, 1);
    const subtotal = Number(product.price ?? 0) * quantity;
    const selectedKey = String(body.logisticsOption ?? 'esyglob_standard');
    const logisticsOptions = [
      { id: 'esyglob_standard', code: 'esyglob_standard', key: 'esyglob_standard', name: 'EsyGlob Standard', mode: 'CIF', incoterm: 'CIF', eta: '18-35 business days', amount: body.orderType === 'sample' ? 250 : Math.max(Math.round(subtotal * 0.04), 500) },
      { id: 'esyglob_premium', code: 'esyglob_premium', key: 'esyglob_premium', name: 'EsyGlob Premium', mode: 'DAP', incoterm: 'DAP', eta: '7-12 business days', amount: body.orderType === 'sample' ? 650 : Math.max(Math.round(subtotal * 0.075), 1200) },
      { id: 'esyglob_express', code: 'esyglob_express', key: 'esyglob_express', name: 'EsyGlob Express', mode: 'DAP', incoterm: 'DAP', eta: '3-7 business days', amount: body.orderType === 'sample' ? 1200 : Math.max(Math.round(subtotal * 0.12), 2500) },
    ];
    const selectedLogistics = logisticsOptions.find(option => option.key === selectedKey) ?? logisticsOptions[0];
    const logisticsAmount = selectedLogistics.amount;
    const platformFee = Math.round(subtotal * 0.02);
    const gstAmount = Math.round(platformFee * 0.18);
    const grandTotal = subtotal + logisticsAmount + platformFee + gstAmount;

    return {
      subtotal,
      quantity,
      unitPrice: Number(product.price ?? 0),
      productTotal: subtotal,
      logisticsAmount,
      logisticsCharges: logisticsAmount,
      platformFee,
      platformFeeRate: 0.02,
      platformFeeSlab: 'standard',
      gstRate: 0.18,
      gstAmount,
      discount: 0,
      grandTotal,
      total: grandTotal,
      totalAmount: grandTotal,
      currency: product.currency ?? 'INR',
      logisticsOptions,
      selectedLogistics,
      automatedServices: [{ code: 'trade_assurance', status: 'attached' }, { code: 'payment_protection', status: 'attached' }],
    };
  }

  async createOrder(userId: string, body: Record<string, unknown>) {
    const productId = this.requireObjectId(body.productId, 'Product id');
    const buyerId = new Types.ObjectId(userId);
    const product = await this.products.findById(productId).lean();

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    if (product.userId?.toString() === userId) {
      throw new BadRequestException('Buyer cannot order their own product.');
    }

    const seller = await this.sellers.findById(product.sellerId).lean();

    if (!seller || seller.verificationStatus === 'suspended') {
      throw new BadRequestException('Seller is not active.');
    }

    const orderSubType = String(body.orderSubType ?? (body.orderType === 'sample' ? 'sample_order' : 'trade_order'));
    if (orderSubType === 'direct_order' && !this.isDirectOrderEnabled(product, seller)) {
      throw new ForbiddenException('Direct order is not enabled for this product.');
    }

    if (orderSubType === 'chat_order') {
      const chatId = this.requireObjectId(body.chatId, 'Chat id');
      const chat = await this.chats.findOne({ _id: chatId, buyerId, sellerId: seller.userId, isActive: { $ne: false } }).lean();
      const eligible = chat?.orderEligibility?.some(item => {
        const nextProductId = item.productId instanceof Types.ObjectId ? item.productId.toString() : String(item.productId ?? '');
        return nextProductId === productId.toString() && item.isActive !== false;
      });
      if (!eligible) {
        throw new ForbiddenException('Start Order is not active for this chat and product.');
      }
    }

    const quantity = Math.max(Number(body.quantity ?? 1) || 1, 1);
    const quote = await this.calculateCheckoutQuote({ productId, quantity, orderType: body.orderType, logisticsOption: body.logisticsOption });
    const now = new Date();
    const order = await this.orders.create({
      orderNumber: await this.nextOrderNumber(body.orderType === 'sample' ? 'SAM' : 'TRD'),
      buyerId,
      sellerId: seller._id,
      sellerUserId: seller.userId,
      productId,
      rfqId: this.optionalObjectId(body.rfqId),
      quotationId: this.optionalObjectId(body.quotationId),
      chatId: this.optionalObjectId(body.chatId),
      orderType: body.orderType === 'sample' ? 'sample' : 'bulk',
      orderSubType,
      status: String(body.status ?? (body.paymentRequired === false ? 'pending_approval' : 'pending_payment')),
      paymentStatus: body.paymentRequired === false ? 'not_required' : 'pending',
      paymentRequired: body.paymentRequired !== false,
      quantity,
      currency: quote.currency,
      totalAmount: quote.totalAmount,
      totalPrice: quote.totalAmount,
      pricePerUnit: quote.unitPrice,
      subtotal: quote.subtotal,
      merchandiseAmount: quote.productTotal,
      shippingCost: quote.logisticsCharges,
      taxAmount: quote.gstAmount,
      platformFeeRate: quote.platformFeeRate,
      platformFee: quote.platformFee,
      gatewayFee: 0,
      netAmount: quote.totalAmount,
      shippingAddress: body.shippingAddress,
      buyerCompany: body.buyerCompany,
      sellerCompany: body.sellerCompany,
      tradeInformation: body.tradeInformation,
      logisticsOption: body.logisticsOption ?? quote.selectedLogistics?.key,
      shippingMethod: quote.selectedLogistics?.name,
      notes: body.notes,
      termsAccepted: body.termsAccepted,
      products: [{ productId, name: product.name, quantity, unit: product.unit, price: product.price, image: product.images?.[0] }],
      tradeAssurance: { status: 'active', automated: true },
      platformServices: quote.automatedServices,
      documents: [{ type: 'invoice', status: 'pending' }, { type: 'shipping', status: 'pending' }],
      timeline: [
        { status: 'order_created', label: 'Order created', at: now },
        { status: 'services_attached', label: 'Trade services attached', at: now },
        { status: body.paymentRequired === false ? 'pending_approval' : 'pending_payment', label: body.paymentRequired === false ? 'Pending seller approval' : 'Pending payment', at: now },
      ],
    });

    await this.notifications.create({
      userId: seller.userId,
      title: 'New order received',
      message: `${order.orderNumber} was created for ${product.name}.`,
      type: 'order_created',
      relatedModel: 'Order',
      relatedId: order._id,
    });

    if (body.paymentRequired !== false) {
      const payment = await this.ensurePendingPayment(order.toObject());
      order.set('paymentId', payment._id);
      await order.save();
    }

    return { order: await this.populateOrder(order._id) };
  }

  async listOrders(userId: string, query: Record<string, QueryValue>) {
    const userObjectId = new Types.ObjectId(userId);
    const seller = await this.sellers.findOne({ userId: userObjectId }).lean();
    const role = this.clean(query.type ?? query.role);
    const filter: Record<string, unknown> = role === 'seller' && seller
      ? { sellerId: seller._id }
      : role === 'buyer'
        ? { buyerId: userObjectId }
        : { $or: [{ buyerId: userObjectId }, ...(seller ? [{ sellerId: seller._id }] : [])] };

    if (query.status) {
      filter.status = this.exactRegex(String(query.status));
    }

    if (query.orderType) {
      filter.orderType = this.exactRegex(String(query.orderType));
    }

    const q = this.clean(query.q);
    if (q) {
      filter.$or = [
        { orderNumber: this.regex(q) },
        { status: this.regex(q) },
        { orderType: this.regex(q) },
        { orderSubType: this.regex(q) },
        { 'products.name': this.regex(q) },
      ];
    }

    const orders = await this.orders.find(filter).sort({ createdAt: -1 }).limit(this.limit(query.limit, 80)).lean();
    return { orders };
  }

  async orderDetails(userId: string, orderId: string) {
    const order = await this.populateOrder(this.requireObjectId(orderId, 'Order id'));

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    await this.assertOrderAccess(userId, order);
    return { order };
  }

  async updateOrderStatus(userId: string, orderId: string, body: Record<string, unknown>) {
    const order = await this.orders.findById(this.requireObjectId(orderId, 'Order id'));

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    await this.assertOrderAccess(userId, order.toObject());
    const status = String(body.status ?? '').trim();

    if (!status) {
      throw new BadRequestException('Status is required.');
    }

    this.assertOrderTransition(String(order.status), status);
    if (status === 'payment_confirmed' && order.paymentStatus !== 'paid') {
      throw new BadRequestException('Payment must be paid before marking the order payment confirmed.');
    }

    order.status = status;
    if (body.trackingNumber) {
      order.set('trackingNumber', body.trackingNumber);
    }
    if (body.estimatedDeliveryDate) {
      order.set('estimatedDeliveryDate', body.estimatedDeliveryDate);
    }
    order.set('timeline', [
      ...((order.get('timeline') as Array<Record<string, unknown>> | undefined) ?? []),
      { status, label: status.replace(/_/g, ' '), notes: body.notes, at: new Date() },
    ]);
    await order.save();
    return { order: await this.populateOrder(order._id) };
  }

  async initiatePayment(userId: string, body: Record<string, unknown>) {
    const orderId = this.requireObjectId(body.orderId, 'Order id');
    const order = await this.orders.findOne({ _id: orderId, buyerId: new Types.ObjectId(userId) }).lean();

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    const payment = await this.ensurePendingPayment(order);
    payment.set('razorpayOrderId', payment.get('razorpayOrderId') ?? `rzp_${order.orderNumber}_${Date.now()}`);
    payment.set('status', payment.status === 'completed' ? 'completed' : 'initiated');
    await payment.save();

    return {
      razorpayOrderId: payment.get('razorpayOrderId'),
      amount: order.totalAmount,
      currency: order.currency,
      paymentId: payment._id.toString(),
      keyId: process.env.RAZORPAY_KEY_ID ?? 'mobile_test_key',
      orderNumber: order.orderNumber,
    };
  }

  async verifyPayment(userId: string, body: Record<string, unknown>) {
    const paymentId = this.requireObjectId(body.paymentId, 'Payment id');
    const payment = await this.payments.findOne({ _id: paymentId, buyerId: new Types.ObjectId(userId) });

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    payment.status = 'completed';
    payment.set('razorpayPaymentId', body.razorpayPaymentId);
    payment.set('razorpayOrderId', body.razorpayOrderId ?? payment.get('razorpayOrderId'));
    payment.set('razorpaySignature', body.razorpaySignature);
    await payment.save();
    await this.orders.updateOne(
      { _id: payment.orderId },
      {
        $set: {
          status: 'payment_confirmed',
          paymentStatus: 'paid',
          paymentMethod: 'razorpay',
        },
        $push: {
          timeline: { status: 'payment_confirmed', label: 'Payment confirmed', at: new Date() },
          documents: { type: 'invoice', status: 'generated', paymentId },
        },
      },
    );

    return { success: true, paymentRecord: payment.toObject(), payment: payment.toObject(), order: await this.populateOrder(payment.orderId) };
  }

  async paymentDetails(userId: string, paymentId: string) {
    const objectId = this.requireObjectId(paymentId, 'Payment id');
    const payment = await this.payments.findById(objectId).lean();

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    const order = await this.orders.findById(payment.orderId).lean();
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    await this.assertOrderAccess(userId, order);
    return { payment };
  }

  async listNotifications(userId: string, query: Record<string, QueryValue>) {
    const unreadOnly = String(query.unreadOnly ?? '').toLowerCase() === 'true';
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

    if (unreadOnly) {
      filter.isRead = false;
    }

    const notifications = await this.notifications
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(this.limit(query.limit, 50))
      .lean();

    return { notifications };
  }

  async home(query: Record<string, QueryValue>) {
    const [categories, latest, featured] = await Promise.all([
      this.listCategories({ limit: 12 }),
      this.listProducts({ limit: query.limit ?? 16, sort: 'latest' }),
      this.listProducts({ limit: 12, sort: 'rating' }),
    ]);

    return {
      categories: categories.categories,
      latestProducts: latest.products,
      featuredProducts: featured.products,
      recommendedProducts: featured.products.length ? featured.products : latest.products,
    };
  }

  private async findOrCreateConversation(input: {
    buyerId: Types.ObjectId;
    sellerUserId: Types.ObjectId;
    productId?: Types.ObjectId;
    rfqId?: Types.ObjectId;
    quotationId?: Types.ObjectId;
    chatType?: string;
  }) {
    const pairKey = `${input.buyerId.toString()}:${input.sellerUserId.toString()}`;
    const existing = await this.chats.findOne({ buyerId: input.buyerId, sellerId: input.sellerUserId, isActive: { $ne: false } });

    if (existing) {
      existing.set('productId', input.productId ?? existing.productId);
      existing.set('rfqId', input.rfqId ?? existing.rfqId);
      existing.set('quotationId', input.quotationId ?? existing.get('quotationId'));
      existing.set('chatType', input.chatType ?? existing.chatType);
      existing.set('pairKey', pairKey);
      await existing.save();
      return { chat: existing.toObject(), created: false };
    }

    const chat = await this.chats.create({
      buyerId: input.buyerId,
      sellerId: input.sellerUserId,
      productId: input.productId,
      rfqId: input.rfqId,
      quotationId: input.quotationId,
      chatType: input.chatType ?? 'general',
      pairKey,
      isActive: true,
      lastMessage: null,
      lastMessageAt: new Date(),
    });

    return { chat: chat.toObject(), created: true };
  }

  private async ensureSellerProfile(userId: string) {
    const objectId = new Types.ObjectId(userId);
    const seller = await this.sellers.findOneAndUpdate(
      { userId: objectId },
      {
        $setOnInsert: {
          userId: objectId,
          verificationStatus: 'pending',
          isVerified: false,
          isActive: true,
        },
      },
      { new: true, upsert: true },
    ).lean();

    if (!seller) {
      throw new BadRequestException('Seller profile could not be loaded.');
    }

    return seller;
  }

  private async ensureSellerVerification(seller: Record<string, any>) {
    const verification = await this.sellerVerifications.findOneAndUpdate(
      { sellerId: seller._id },
      {
        $setOnInsert: {
          sellerId: seller._id,
          userId: seller.userId,
          status: 'pending',
          documents: [],
          onboardingCompleted: false,
        },
      },
      { new: true, upsert: true },
    ).lean();

    if (!verification) {
      throw new BadRequestException('Seller verification could not be loaded.');
    }

    return verification;
  }

  private sellerOnboardingPayload(body: Record<string, unknown>, strict: boolean) {
    const address = (body.address && typeof body.address === 'object' ? body.address : {}) as Record<string, unknown>;
    const required = [
      ['companyName', body.companyName],
      ['companyType', body.companyType],
      ['businessEmail', body.businessEmail],
      ['businessPhone', body.businessPhone],
      ['address.street', address.street],
      ['address.city', address.city],
      ['address.state', address.state],
      ['address.country', address.country],
      ['address.pincode', address.pincode],
    ];

    if (strict) {
      const missing = required.filter(([, value]) => !String(value ?? '').trim()).map(([label]) => label);
      if (missing.length) {
        throw new BadRequestException(`Missing required onboarding fields: ${missing.join(', ')}`);
      }
      if (String(body.companyName ?? '').trim().length < 2) throw new BadRequestException('Company name must be at least 2 characters.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.businessEmail ?? ''))) throw new BadRequestException('Business email is invalid.');
      if (String(body.businessPhone ?? '').trim().length < 8) throw new BadRequestException('Business phone must be at least 8 characters.');
    }

    return {
      companyName: this.cleanString(body.companyName),
      businessName: this.cleanString(body.companyName),
      displayName: this.cleanString(body.companyName),
      companyType: this.cleanString(body.companyType),
      businessEmail: this.cleanString(body.businessEmail)?.toLowerCase(),
      businessPhone: this.cleanString(body.businessPhone),
      gstNumber: this.cleanString(body.gstNumber),
      panNumber: this.cleanString(body.panNumber),
      address: {
        street: this.cleanString(address.street),
        city: this.cleanString(address.city),
        state: this.cleanString(address.state),
        country: this.cleanString(address.country) ?? 'India',
        pincode: this.cleanString(address.pincode),
      },
      country: this.cleanString(address.country) ?? 'India',
    };
  }

  private sellerCompletion(seller: Record<string, any>) {
    const address = seller.address ?? {};
    const checks = {
      companyName: seller.companyName,
      companyType: seller.companyType,
      businessEmail: seller.businessEmail,
      businessPhone: seller.businessPhone,
      'address.street': address.street,
      'address.city': address.city,
      'address.state': address.state,
      'address.country': address.country,
      'address.pincode': address.pincode,
    };
    const completedFields = Object.entries(checks).filter(([, value]) => Boolean(String(value ?? '').trim())).map(([key]) => key);
    const remainingFields = Object.keys(checks).filter(key => !completedFields.includes(key));

    return {
      completedFields,
      remainingFields,
      completedFieldCount: completedFields.length,
      totalFieldCount: Object.keys(checks).length,
    };
  }

  private async updateVerificationCompletion(verificationId: Types.ObjectId, seller: Record<string, any>) {
    await this.sellerVerifications.updateOne({ _id: verificationId }, { $set: this.sellerCompletion(seller) });
  }

  private async saveUploadFile(file: any, folder: string) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload file is required.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Upload file must be 5MB or smaller.');
    }

    const targetDir = join(UPLOAD_ROOT, folder);
    await mkdir(targetDir, { recursive: true });
    const extension = extname(String(file.originalname ?? '')).toLowerCase() || this.extensionForMime(String(file.mimetype ?? ''));
    const filename = `${Date.now()}-${randomUUID()}${extension}`;
    await writeFile(join(targetDir, filename), file.buffer);

    return {
      id: filename,
      url: `/api/uploads/${folder}/${filename}`,
      name: file.originalname ?? filename,
      mimeType: file.mimetype ?? 'application/octet-stream',
      size: file.size ?? file.buffer.length,
    };
  }

  private async productPayload(body: Record<string, unknown>, seller: Record<string, any>, userId: string) {
    const status = String(body.status ?? 'draft');
    const images = Array.isArray(body.images) ? body.images.map(String).filter(Boolean).slice(0, 8) : [];
    const name = this.cleanString(body.name);
    const description = this.cleanString(body.description);
    const categoryId = this.optionalObjectId(body.categoryId);
    const subcategoryId = this.optionalObjectId(body.subcategoryId);
    const categoryDoc = categoryId ? await this.categories.findOne({ _id: categoryId, isActive: { $ne: false } }).lean() : null;
    const subcategoryDoc = subcategoryId ? await this.subcategories.findOne({ _id: subcategoryId, isActive: { $ne: false } }).lean() : null;

    if (status !== 'draft') {
      if (!name || name.length < 2) throw new BadRequestException('Product name must be at least 2 characters.');
      if (!categoryId || !categoryDoc) throw new BadRequestException('Select an active category.');
      if (!subcategoryId || !subcategoryDoc) throw new BadRequestException('Select an active subcategory.');
      if (!description || description.length < 20) throw new BadRequestException('Description must be at least 20 characters.');
      if (!images.length) throw new BadRequestException('At least one product image is required.');
      if (Number(body.minimumOrderQuantity ?? 1) < 1) throw new BadRequestException('MOQ must be at least 1.');
    }

    return {
      sellerId: seller._id,
      userId: new Types.ObjectId(userId),
      categoryId,
      subcategoryId,
      category: this.cleanString(body.category) ?? categoryDoc?.name,
      subcategory: this.cleanString(body.subcategory) ?? subcategoryDoc?.name,
      name: name ?? 'Untitled product draft',
      slug: this.slugify(name ?? `product-${Date.now()}`),
      productType: this.cleanString(body.productType),
      description,
      price: Math.max(Number(body.price ?? 0) || 0, 0),
      currency: body.currency ?? 'INR',
      minimumOrderQuantity: Math.max(Number(body.minimumOrderQuantity ?? 1) || 1, 1),
      moq: Math.max(Number(body.minimumOrderQuantity ?? 1) || 1, 1),
      unit: this.cleanString(body.unit) ?? 'pcs',
      orderType: body.orderType ?? 'inquiry_only',
      directOrderEnabled: Boolean(body.directOrderEnabled),
      sampleAvailable: Boolean(body.sampleAvailable),
      samplePrice: Number(body.samplePrice ?? 0) || 0,
      paymentTerms: body.paymentTerms,
      leadTime: body.leadTime,
      leadTimeUnit: body.leadTimeUnit,
      deliveryTime: body.deliveryTime,
      deliveryTimeUnit: body.deliveryTimeUnit,
      warranty: body.warranty,
      warrantyPeriod: body.warrantyPeriod,
      shipping: body.shipping,
      specifications: body.specifications && typeof body.specifications === 'object' ? body.specifications : {},
      manufacturingDetails: body.manufacturingDetails,
      packaging: body.packaging,
      certifications: Array.isArray(body.certifications) ? body.certifications : [],
      tags: Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean) : [],
      priceTiers: Array.isArray(body.priceTiers) ? body.priceTiers : [],
      images,
      status,
    };
  }

  private async upsertProductMapping(product: Record<string, any>) {
    if (!product.categoryId || !product.subcategoryId) {
      return;
    }

    await this.connection.collection('productcategorymappings').insertOne({
      productId: product._id,
      sellerId: product.sellerId,
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId,
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  private visibilityNotice(status: string, seller: Record<string, any>) {
    if (status === 'draft') return 'Product saved as a draft.';
    if (seller.isVerified || seller.verificationStatus === 'approved' || seller.verificationStatus === 'verified') return 'Product is published in the marketplace.';
    return 'Product saved as published, but marketplace visibility starts after seller verification is approved.';
  }

  private cleanString(value: unknown) {
    const next = typeof value === 'string' ? value.trim() : '';
    return next || undefined;
  }

  private slugify(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  }

  private async populateChat(chatId: Types.ObjectId) {
    return this.chats
      .findById(chatId)
      .populate('buyerId', 'name fullName email profileImage avatar image')
      .populate('sellerId', 'name fullName email profileImage avatar image')
      .populate('productId', 'name slug images price currency minimumOrderQuantity unit status')
      .populate('rfqId', 'title quantity unit deliveryCountry status')
      .populate('quotationId', 'title status totalPrice currency')
      .lean();
  }

  private async populateOrder(orderId: Types.ObjectId) {
    return this.orders
      .findById(orderId)
      .populate('buyerId', 'name fullName email profileImage avatar image')
      .populate('sellerId', 'companyName businessName displayName country verificationStatus isVerified rating')
      .populate('productId', 'name slug images price currency minimumOrderQuantity unit')
      .populate('rfqId', 'title quantity unit deliveryCountry status')
      .populate('quotationId', 'title status totalPrice currency')
      .populate('chatId', 'chatType lastMessage')
      .lean();
  }

  private async assertOrderAccess(userId: string, order: Record<string, any>) {
    const seller = await this.sellers.findOne({ userId: new Types.ObjectId(userId) }).select('_id').lean();
    const buyerId = order.buyerId?._id?.toString?.() ?? order.buyerId?.toString?.();
    const sellerId = order.sellerId?._id?.toString?.() ?? order.sellerId?.toString?.();

    if (buyerId !== userId && (!seller || seller._id.toString() !== sellerId)) {
      throw new ForbiddenException('You do not have access to this order.');
    }
  }

  private async ensurePendingPayment(order: Record<string, any>) {
    const existing = await this.payments.findOne({ orderId: order._id, status: { $in: ['pending', 'initiated'] } });

    if (existing) {
      return existing;
    }

    return this.payments.create({
      orderId: order._id,
      userId: order.buyerId,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      paymentNumber: `PAY${Date.now()}`,
      amount: order.totalAmount,
      orderAmount: order.totalAmount,
      platformFeeRate: order.platformFeeRate ?? 0,
      platformFee: order.platformFee ?? 0,
      gatewayFee: order.gatewayFee ?? 0,
      netAmount: order.netAmount ?? order.totalAmount,
      paymentFor: 'order',
      method: 'razorpay',
      paymentMethod: 'razorpay',
      status: 'pending',
      gateway: 'razorpay',
    });
  }

  private assertOrderTransition(current: string, next: string) {
    const transitions: Record<string, string[]> = {
      draft: ['pending_approval', 'cancelled'],
      pending_approval: ['awaiting_payment', 'rejected', 'cancelled'],
      awaiting_payment: ['payment_confirmed', 'cancelled'],
      pending_payment: ['payment_confirmed', 'cancelled'],
      payment_confirmed: ['confirmed', 'processing', 'cancelled', 'refunded'],
      confirmed: ['production', 'processing', 'cancelled'],
      processing: ['production', 'ready_to_ship', 'cancelled'],
      production: ['ready_to_ship', 'cancelled'],
      ready_to_ship: ['shipped', 'cancelled'],
      shipped: ['delivered', 'disputed'],
      delivered: ['completed', 'disputed'],
      disputed: ['refunded', 'completed'],
    };

    if (current === next) {
      return;
    }

    if (!(transitions[current] ?? []).includes(next)) {
      throw new BadRequestException(`Order cannot move from ${current} to ${next}.`);
    }
  }

  private extensionForMime(mimeType: string) {
    if (mimeType.includes('png')) return '.png';
    if (mimeType.includes('webp')) return '.webp';
    if (mimeType.includes('pdf')) return '.pdf';
    if (mimeType.includes('word')) return '.docx';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '.xlsx';
    if (mimeType.includes('zip')) return '.zip';
    if (mimeType.includes('text')) return '.txt';
    if (mimeType.includes('audio')) return '.m4a';
    return '.bin';
  }

  private isDirectOrderEnabled(product: Record<string, any>, seller: Record<string, any>) {
    const productEnabled = Boolean(product.directOrderEnabled || product.orderEnabled);
    const sellerTrusted = Boolean(seller.trustedSeller || seller.isTrusted || seller.trustedBadgeActive || seller.isVerified || seller.verificationStatus === 'verified');
    return productEnabled && sellerTrusted;
  }

  private async nextOrderNumber(prefix: string) {
    const count = await this.orders.countDocuments({ orderNumber: new RegExp(`^${prefix}`) });
    return `${prefix}${String(count + 1).padStart(8, '0')}`;
  }

  private requireObjectId(value: unknown, label: string) {
    if (value instanceof Types.ObjectId) {
      return value;
    }

    if (typeof value === 'string' && Types.ObjectId.isValid(value)) {
      return new Types.ObjectId(value);
    }

    throw new BadRequestException(`${label} is invalid.`);
  }

  private optionalObjectId(value: unknown) {
    if (!value) {
      return undefined;
    }

    if (value instanceof Types.ObjectId) {
      return value;
    }

    return typeof value === 'string' && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined;
  }

  private async productFilter(query: Record<string, QueryValue>) {
    const filter: Record<string, unknown> = { status: { $in: PRODUCT_VISIBLE_STATUSES } };
    const q = this.clean(query.q);
    const category = this.clean(query.category);
    const subcategory = this.clean(query.subcategory);
    const seller = this.clean(query.seller);
    const verifiedOnly = query.verifiedOnly === true || query.verifiedOnly === 'true';
    const minPrice = Number(query.minPrice);
    const maxPrice = Number(query.maxPrice);

    if (q) {
      filter.$or = [
        { name: this.regex(q) },
        { description: this.regex(q) },
        { category: this.regex(q) },
        { subcategory: this.regex(q) },
        { tags: this.regex(q) },
      ];
    }

    if (category) {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { category: this.exactRegex(category) },
            { subcategory: this.exactRegex(category) },
            ...(Types.ObjectId.isValid(category) ? [{ categoryId: new Types.ObjectId(category) }] : []),
          ],
        },
      ];
    }

    if (subcategory) {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        { subcategory: this.exactRegex(subcategory) },
      ];
    }

    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      filter.price = {
        ...(Number.isFinite(minPrice) ? { $gte: minPrice } : {}),
        ...(Number.isFinite(maxPrice) ? { $lte: maxPrice } : {}),
      };
    }

    if (seller) {
      const sellerIds = await this.sellers
        .find({
          $or: [
            { companyName: this.regex(seller) },
            { businessName: this.regex(seller) },
            { displayName: this.regex(seller) },
          ],
        })
        .select('_id')
        .lean();

      if (Types.ObjectId.isValid(seller)) {
        filter.sellerId = { $in: [new Types.ObjectId(seller), ...sellerIds.map(item => item._id)] };
      } else {
        filter.sellerId = { $in: sellerIds.map(item => item._id) };
      }
    }

    if (verifiedOnly) {
      const verifiedSellerIds = await this.sellers
        .find({ $or: [{ isVerified: true }, { verificationStatus: 'verified' }] })
        .select('_id')
        .lean();
      const ids = verifiedSellerIds.map(item => item._id);
      const verifiedIdSet = new Set(ids.map(id => id.toString()));
      const currentSellerIds =
        filter.sellerId && typeof filter.sellerId === 'object' && '$in' in filter.sellerId
          ? (filter.sellerId as { $in: Types.ObjectId[] }).$in
          : null;

      filter.sellerId = {
        $in: currentSellerIds ? currentSellerIds.filter(id => verifiedIdSet.has(id.toString())) : ids,
      };
    }

    return filter;
  }

  private serializeProduct(product: Record<string, any>) {
    const seller = product.sellerId;

    return {
      ...product,
      id: product._id?.toString(),
      image: Array.isArray(product.images) ? product.images[0] : undefined,
      minPrice: product.price,
      maxPrice: product.price,
      moq: product.minimumOrderQuantity,
      country: product.countryOfOrigin,
      originCountry: product.countryOfOrigin,
      seller,
    };
  }

  private serializeSeller(seller: Record<string, any>, productMeta?: Record<string, any>) {
    const address = seller.address ?? {};
    const user = seller.userId && typeof seller.userId === 'object' ? seller.userId : undefined;

    return {
      ...seller,
      id: seller._id?.toString(),
      displayName: seller.displayName ?? seller.companyName ?? seller.businessName ?? user?.name ?? user?.fullName,
      country: seller.country ?? address.country,
      productCount: seller.productCount ?? productMeta?.count ?? 0,
      mainCategories: seller.mainCategories?.length ? seller.mainCategories : productMeta?.categories ?? [],
      factoryImages: seller.factoryImages?.length ? seller.factoryImages : productMeta?.images?.filter(Boolean)?.slice(0, 4) ?? [],
      minMoq: seller.minMoq ?? productMeta?.minMoq,
    };
  }

  private async findSeller(sellerId: string) {
    if (Types.ObjectId.isValid(sellerId)) {
      return this.sellers.findById(sellerId).populate('userId', 'name fullName email').lean();
    }

    return this.sellers
      .findOne({
        $or: [
          { companyName: this.exactRegex(sellerId) },
          { businessName: this.exactRegex(sellerId) },
          { displayName: this.exactRegex(sellerId) },
        ],
      })
      .populate('userId', 'name fullName email')
      .lean();
  }

  private productSort(sort: QueryValue): Record<string, SortOrder> {
    switch (sort) {
      case 'price_asc':
        return { price: 1, createdAt: -1 };
      case 'price_desc':
        return { price: -1, createdAt: -1 };
      case 'rating':
        return { averageRating: -1, reviewCount: -1, createdAt: -1 };
      case 'latest':
      default:
        return { createdAt: -1 };
    }
  }

  private sellerSort(sort: QueryValue): Record<string, SortOrder> {
    switch (sort) {
      case 'rating':
        return { rating: -1, trustScore: -1, createdAt: -1 };
      case 'verified':
        return { isVerified: -1, verificationStatus: 1, createdAt: -1 };
      case 'products':
        return { productCount: -1, createdAt: -1 };
      case 'latest':
      default:
        return { createdAt: -1 };
    }
  }

  private clean(value: QueryValue) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private regex(value: string) {
    return new RegExp(this.escape(value), 'i');
  }

  private exactRegex(value: string) {
    return new RegExp(`^${this.escape(value)}$`, 'i');
  }

  private escape(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private limit(value: QueryValue, max: number) {
    const parsed = Number(value ?? 20);
    return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 20, 1), max);
  }

  private page(value: QueryValue) {
    const parsed = Number(value ?? 1);
    return Math.max(Number.isFinite(parsed) ? parsed : 1, 1);
  }
}
