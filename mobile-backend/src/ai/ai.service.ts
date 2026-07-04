import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, Product, Rfq } from '../marketplace/catalog.schemas';
import { Seller } from '../sellers/seller.schema';
import { AIChat, AIChatDocument, SavedResearchReport, SavedResearchReportDocument } from './ai.schemas';

type ChatInput = {
  message?: string;
  displayMessage?: string;
  chatId?: string;
  role?: string;
  conversationType?: string;
  context?: Record<string, unknown>;
  pluginPayload?: Record<string, unknown>;
  responseCard?: Record<string, unknown>;
};

type InsightInput = {
  reportType?: string;
  product?: string;
  country?: string;
  category?: string;
  timeframe?: string;
  filters?: Record<string, unknown>;
};

@Injectable()
export class AIService {
  constructor(
    @InjectModel(AIChat.name) private readonly chats: Model<AIChat>,
    @InjectModel(SavedResearchReport.name) private readonly reports: Model<SavedResearchReport>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Category.name) private readonly categories: Model<Category>,
    @InjectModel(Seller.name) private readonly sellers: Model<Seller>,
    @InjectModel(Rfq.name) private readonly rfqs: Model<Rfq>,
  ) {}

  async listChats(userId: string, query: { chatId?: string; role?: string }) {
    if (query.chatId) {
      const chat = await this.chats.findOne({ _id: query.chatId, userId }).lean();
      if (!chat) throw new NotFoundException('Chat not found');
      return { chat };
    }

    const filter: Record<string, unknown> = { userId, status: 'active' };
    if (query.role) filter.roleContext = query.role;
    const chats = await this.chats.find(filter).sort({ lastMessageAt: -1 }).limit(60).lean();
    return { chats };
  }

  async processChat(userId: string, input: ChatInput) {
    const message = String(input.message ?? '').trim();
    if (!message) throw new BadRequestException('Message is required');

    const chat = await this.resolveChat(userId, input);
    const userMessage = this.message('user', input.displayMessage || message, { pluginPayload: input.pluginPayload });
    const responseText = await this.generateAssistantResponse(message, input.role ?? chat.roleContext);
    const assistantMessage = this.message('assistant', responseText, { card: input.responseCard, provider: 'esyglob_mobile_intelligence' });

    chat.messages.push(userMessage, assistantMessage);
    chat.totalMessages = chat.messages.length;
    chat.totalTokensUsed += this.estimateTokens(message) + this.estimateTokens(responseText);
    chat.lastMessageAt = new Date();
    chat.context = { ...(chat.context ?? {}), ...(input.context ?? {}), lastQuery: message };
    await chat.save();

    return {
      chat: chat.toObject(),
      response: {
        message: responseText,
        success: true,
        fallback: false,
        tokensUsed: this.estimateTokens(responseText),
        provider: chat.provider,
        model: chat.model,
      },
      supportTicket: null,
    };
  }

  async patchChat(userId: string, input: { chatId?: string; title?: string; status?: string }) {
    if (!input.chatId) throw new BadRequestException('chatId is required');
    const update: Record<string, unknown> = {};
    if (input.title) update.title = input.title.trim().slice(0, 120);
    if (input.status) update.status = input.status === 'archived' ? 'archived' : 'active';
    const chat = await this.chats.findOneAndUpdate({ _id: input.chatId, userId }, { $set: update }, { new: true }).lean();
    if (!chat) throw new NotFoundException('Chat not found');
    return { chat };
  }

  async deleteChat(userId: string, chatId?: string) {
    if (!chatId) throw new BadRequestException('chatId is required');
    const chat = await this.chats.findOneAndUpdate({ _id: chatId, userId }, { $set: { status: 'archived' } }, { new: true }).lean();
    if (!chat) throw new NotFoundException('Chat not found');
    return { chat, archived: true };
  }

  async providerStatus() {
    return {
      status: 'ready',
      provider: 'esyglob_mobile_intelligence',
      model: 'marketplace-context-v1',
      streaming: true,
      marketplaceContext: true,
    };
  }

  async generateMarketInsight(userId: string, input: InsightInput) {
    const report = await this.buildMarketReport(input);
    const saved = await this.reports.create({
      userId,
      title: report.title,
      reportType: input.reportType ?? 'product',
      request: input,
      report,
      status: 'active',
    });

    return { report: { ...report, _id: saved._id.toString() }, savedReport: saved };
  }

  async listMarketInsights(userId: string, query: { reportId?: string; reportType?: string }) {
    if (query.reportId) {
      const report = await this.reports.findOne({ _id: query.reportId, userId }).lean();
      if (!report) throw new NotFoundException('Report not found');
      return { report };
    }
    const filter: Record<string, unknown> = { userId, status: 'active' };
    if (query.reportType) filter.reportType = query.reportType;
    const reports = await this.reports.find(filter).sort({ createdAt: -1 }).limit(30).lean();
    return { reports };
  }

  async patchMarketInsight(userId: string, input: { reportId?: string; title?: string; status?: string }) {
    if (!input.reportId) throw new BadRequestException('reportId is required');
    const update: Record<string, unknown> = {};
    if (input.title) update.title = input.title.trim().slice(0, 160);
    if (input.status) update.status = input.status === 'archived' ? 'archived' : 'active';
    const report = await this.reports.findOneAndUpdate({ _id: input.reportId, userId }, { $set: update }, { new: true }).lean();
    if (!report) throw new NotFoundException('Report not found');
    return { report };
  }

  async deleteMarketInsight(userId: string, reportId?: string) {
    if (!reportId) throw new BadRequestException('reportId is required');
    const report = await this.reports.findOneAndUpdate({ _id: reportId, userId }, { $set: { status: 'archived' } }, { new: true }).lean();
    if (!report) throw new NotFoundException('Report not found');
    return { report, archived: true };
  }

  private async resolveChat(userId: string, input: ChatInput): Promise<AIChatDocument> {
    if (input.chatId) {
      const existing = await this.chats.findOne({ _id: input.chatId, userId });
      if (!existing) throw new NotFoundException('Chat not found');
      return existing;
    }

    return this.chats.create({
      userId,
      title: this.makeTitle(input.displayMessage || input.message || 'New chat'),
      roleContext: input.role ?? 'buyer',
      conversationType: input.conversationType ?? 'assistant',
      provider: 'esyglob_mobile_intelligence',
      model: 'marketplace-context-v1',
      messages: [],
      context: input.context ?? {},
      status: 'active',
      totalMessages: 0,
      totalTokensUsed: 0,
      lastMessageAt: new Date(),
    });
  }

  private async generateAssistantResponse(message: string, role: string) {
    const [products, categories, sellers, rfqs] = await Promise.all([
      this.products.find({ status: { $in: ['active', 'published'] } }).sort({ createdAt: -1 }).limit(5).lean(),
      this.categories.find({ isActive: true }).sort({ name: 1 }).limit(5).lean(),
      this.sellers.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).limit(5).lean(),
      this.rfqs.find({ visibility: 'public' }).sort({ createdAt: -1 }).limit(3).lean(),
    ]);

    const productNames = products.map(item => item.name).filter(Boolean).join(', ') || 'current marketplace products';
    const categoryNames = categories.map(item => item.name).filter(Boolean).join(', ') || 'available categories';
    const sellerNames = sellers.map(item => item.companyName ?? item.businessName).filter(Boolean).join(', ') || 'verified suppliers';
    const rfqTitles = rfqs.map(item => item.title).filter(Boolean).join(', ') || 'recent RFQs';
    const pluginHint = /quotation/i.test(message)
      ? 'This is a quotation suggestion only; it has not been submitted or saved as a quotation record.'
      : /rfq/i.test(message)
        ? 'This is an RFQ suggestion only; it has not been posted or saved as an RFQ record.'
        : '';

    return [
      `Here is an EsyGlob ${role || 'marketplace'} assistant response based on live marketplace context.`,
      `Your request: "${message}"`,
      `Relevant products: ${productNames}.`,
      `Relevant categories: ${categoryNames}.`,
      `Supplier context: ${sellerNames}.`,
      `RFQ context: ${rfqTitles}.`,
      pluginHint,
      'Recommended next step: review the matching products/suppliers, keep all communication on EsyGlob, and use Messenger or Services when you are ready to continue the workflow.',
    ].filter(Boolean).join('\n\n');
  }

  private async buildMarketReport(input: InsightInput) {
    const term = String(input.product || input.category || '').trim();
    const country = String(input.country || 'Global').trim();
    const productQuery = term
      ? { $or: [{ name: new RegExp(term, 'i') }, { category: new RegExp(term, 'i') }, { description: new RegExp(term, 'i') }] }
      : {};
    const [products, categories, sellers, rfqCount] = await Promise.all([
      this.products.find(productQuery).limit(12).lean(),
      this.categories.find({ isActive: true }).limit(12).lean(),
      this.sellers.find({ isActive: { $ne: false } }).limit(12).lean(),
      this.rfqs.countDocuments({ visibility: 'public' }),
    ]);
    const prices = products.map(item => Number(item.price || 0)).filter(value => value > 0);
    const avgPrice = prices.length ? Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length) : 0;
    const title = `${this.titleCase(input.reportType || 'product')} Market Insight${term ? `: ${term}` : ''}`;

    return {
      title,
      summary: `Live marketplace report for ${term || 'selected trade categories'} in ${country}. It uses current EsyGlob products, supplier profiles, public RFQs, and category coverage available to the mobile backend.`,
      generatedAt: new Date().toISOString(),
      sources: ['EsyGlob Marketplace DB', 'Product catalog', 'Supplier profiles', 'Public RFQs'],
      metrics: {
        matchingProducts: products.length,
        activeCategories: categories.length,
        supplierSample: sellers.length,
        publicRfqs: rfqCount,
        averageListedPrice: avgPrice,
      },
      charts: [
        {
          title: 'Marketplace signals',
          type: 'bar',
          data: [
            { label: 'Products', value: products.length },
            { label: 'Suppliers', value: sellers.length },
            { label: 'Categories', value: categories.length },
            { label: 'RFQs', value: rfqCount },
          ],
        },
        {
          title: 'Price sample',
          type: 'bar',
          data: products.slice(0, 6).map(item => ({ label: item.name, value: Number(item.price || 0) })),
        },
      ],
      sections: [
        {
          title: 'Executive outlook',
          content: `${products.length} matching products and ${sellers.length} supplier profiles were found in the current marketplace sample. Average listed price in this sample is ${avgPrice || 'not available'}.`,
          bullets: [
            'Prioritize verified suppliers and recent catalog activity.',
            'Use RFQs for exact MOQ, lead time, packaging, and destination terms.',
            'Compare supplier responsiveness before moving to quotation or order.',
          ],
        },
        {
          title: 'Opportunity finder',
          bullets: categories.slice(0, 5).map(item => `Explore ${item.name} for adjacent sourcing opportunities.`),
        },
      ],
      tables: [
        {
          title: 'Product sample',
          rows: products.slice(0, 8).map(item => ({
            product: item.name,
            category: item.category || 'Uncategorized',
            price: item.price,
            currency: item.currency,
            moq: item.minimumOrderQuantity,
          })),
        },
      ],
      opportunities: products.slice(0, 5).map(item => ({
        productId: item._id,
        name: item.name,
        category: item.category,
        suggestedAction: 'Shortlist supplier and send an RFQ for exact terms.',
      })),
    };
  }

  private message(role: 'user' | 'assistant', content: string, metadata: Record<string, unknown> = {}) {
    return {
      _id: new Types.ObjectId(),
      role,
      content,
      metadata,
      createdAt: new Date(),
    };
  }

  private estimateTokens(text: string) {
    return Math.ceil(text.length / 4);
  }

  private makeTitle(text: string) {
    return text.trim().replace(/\s+/g, ' ').slice(0, 80) || 'New chat';
  }

  private titleCase(value: string) {
    return value.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  }
}
