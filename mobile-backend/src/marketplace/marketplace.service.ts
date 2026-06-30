import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Connection, Model, SortOrder, Types } from 'mongoose';
import { Seller } from '../sellers/seller.schema';
import { Category, Chat, Message, Notification, Product, Quotation, Rfq, Subcategory } from './catalog.schemas';

const PRODUCT_VISIBLE_STATUSES = ['published', 'active'];
const RFQ_VISIBLE_STATUSES = ['active', 'pending', 'viewed', 'replied', 'quoted', 'negotiating'];

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
    @InjectModel(Seller.name) private readonly sellers: Model<Seller>,
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
        .populate('sellerId', 'companyName businessName displayName country verificationStatus isVerified')
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
      .populate('sellerId', 'companyName businessName displayName address country verificationStatus isVerified trustScore rating')
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

    return { chat, messages };
  }

  async sendMessage(userId: string, chatId: string, body: Record<string, unknown>) {
    if (!Types.ObjectId.isValid(chatId)) {
      throw new BadRequestException('Invalid chat id.');
    }

    const text = typeof body.content === 'string' ? body.content.trim() : typeof body.text === 'string' ? body.text.trim() : '';

    if (!text) {
      throw new BadRequestException('Message text is required.');
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
      messageType: 'text',
    });

    await this.chats.updateOne(
      { _id: chat._id },
      {
        $set: {
          lastMessage: text,
          lastMessageAt: new Date(),
        },
      },
    );

    return { message: message.toObject() };
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
