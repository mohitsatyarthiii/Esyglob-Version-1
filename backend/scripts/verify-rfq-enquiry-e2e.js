import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Seller from '../src/models/Seller.js';
import Category from '../src/models/Category.js';
import Subcategory from '../src/models/Subcategory.js';
import Chat from '../src/models/Chat.js';
import Message from '../src/models/Message.js';
import Notification from '../src/models/Notification.js';
import RFQ from '../src/models/RFQ.js';
import * as chatService from '../src/services/chat.service.js';
import * as rfqService from '../src/services/rfq.service.js';

const databaseUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!databaseUrl) throw new Error('MongoDB is not configured');

const runId = `codex-e2e-${Date.now()}`;
const created = { users: [], sellers: [], categories: [], subcategories: [], rfqs: [], chats: [] };
const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
  await mongoose.connect(databaseUrl);
  const category = await Category.create({ name: `${runId} Steel`, slug: `${runId}-steel`, isActive: true });
  created.categories.push(category._id);
  const [pipes, sheets] = await Subcategory.create([
    { categoryId: category._id, name: `${runId} Pipes`, slug: `${runId}-pipes`, isActive: true },
    { categoryId: category._id, name: `${runId} Sheets`, slug: `${runId}-sheets`, isActive: true },
  ]);
  created.subcategories.push(pipes._id, sheets._id);

  const users = await User.create([
    { email: `${runId}-buyer@example.invalid`, passwordHash: 'integration-test-only', fullName: 'E2E Buyer', roles: ['buyer'], primaryRole: 'buyer', isActive: true },
    { email: `${runId}-seller-a@example.invalid`, passwordHash: 'integration-test-only', fullName: 'E2E Seller A', roles: ['seller'], primaryRole: 'seller', isActive: true },
    { email: `${runId}-seller-b@example.invalid`, passwordHash: 'integration-test-only', fullName: 'E2E Seller B', roles: ['seller'], primaryRole: 'seller', isActive: true },
    { email: `${runId}-seller-c@example.invalid`, passwordHash: 'integration-test-only', fullName: 'E2E Seller C', roles: ['seller'], primaryRole: 'seller', isActive: true },
  ]);
  created.users.push(...users.map((item) => item._id));
  const [buyer, sellerAUser, sellerBUser, sellerCUser] = users;

  const sellers = await Seller.create([
    { userId: sellerAUser._id, companyName: 'E2E Seller A', companyType: 'manufacturer', productCategories: [category.name], productSubcategories: [pipes.name], isActive: true, isSuspended: false, isVerified: true, verificationStatus: 'approved' },
    { userId: sellerBUser._id, companyName: 'E2E Seller B', companyType: 'manufacturer', productCategories: [category.name], productSubcategories: [sheets.name], isActive: true, isSuspended: false, isVerified: true, verificationStatus: 'approved' },
    { userId: sellerCUser._id, companyName: 'E2E Seller C', companyType: 'manufacturer', productCategories: ['Unrelated category'], productSubcategories: ['Unrelated subcategory'], isActive: true, isSuspended: false, isVerified: true, verificationStatus: 'approved' },
  ]);
  created.sellers.push(...sellers.map((item) => item._id));

  const buyerSession = { userId: String(buyer._id), roles: ['buyer'], primaryRole: 'buyer', user: { fullName: buyer.fullName } };
  const direct = await chatService.createChat(buyerSession, { otherUserId: String(sellerAUser._id), role: 'buyer', enquiry: true });
  created.chats.push(direct.chat._id);
  await chatService.sendMessage({ id: String(buyer._id), fullName: buyer.fullName, email: buyer.email }, String(direct.chat._id), { content: 'Direct test enquiry for pipes\n\nRequested quantity: 100 pcs' });
  assert(await Message.exists({ chatId: direct.chat._id, senderId: buyer._id, receiverId: sellerAUser._id, content: /Direct test enquiry/ }), 'Seller A did not receive the direct enquiry message');
  assert(await Notification.exists({ userId: sellerAUser._id, notificationType: 'new_inquiry', 'data.relatedId': direct.chat._id }), 'Seller A did not receive the direct enquiry notification');
  assert(!(await Notification.exists({ userId: { $in: [sellerBUser._id, sellerCUser._id] }, notificationType: 'new_inquiry' })), 'A non-target seller received the direct enquiry');

  const result = await rfqService.createRfq(buyerSession, {
    title: `${runId} Public pipes RFQ`, description: 'Public deterministic matching test',
    category: category.name, subcategory: pipes.name, quantity: 500, unit: 'pcs',
    deliveryCountry: 'India', deliveryTimeline: '30_days', visibility: 'public', status: 'active',
  });
  created.rfqs.push(result.rfq._id);
  const rfqId = result.rfq._id;
  assert(await RFQ.exists({ _id: rfqId, visibility: 'public', status: 'submitted' }), 'The public RFQ was not persisted');
  assert(await Notification.exists({ eventKey: `public-rfq:${rfqId}:${sellerAUser._id}` }), 'Seller A did not receive the matching public RFQ notification');
  assert(!(await Notification.exists({ eventKey: { $in: [`public-rfq:${rfqId}:${sellerBUser._id}`, `public-rfq:${rfqId}:${sellerCUser._id}`] } })), 'A non-matching seller received the public RFQ notification');
  assert(await Message.exists({ deliveryKey: `public-rfq:${rfqId}:${sellerAUser._id}`, receiverId: sellerAUser._id }), 'Seller A did not receive the public RFQ inbox message');
  assert(!(await Message.exists({ deliveryKey: { $in: [`public-rfq:${rfqId}:${sellerBUser._id}`, `public-rfq:${rfqId}:${sellerCUser._id}`] } })), 'A non-matching seller received the public RFQ inbox message');
  const listing = await rfqService.getRfqs(null, { search: runId, limit: 10 });
  assert(listing.rfqs.some((item) => String(item._id) === String(rfqId)), 'The persisted RFQ was missing from the public listing');

  const privateResult = await rfqService.createRfq(buyerSession, {
    title: `${runId} Private regression RFQ`, description: 'Existing private RFQ regression test',
    category: category.name, subcategory: sheets.name, quantity: 25, unit: 'pcs',
    deliveryCountry: 'India', deliveryTimeline: '30_days', sellerId: String(sellers[1]._id), visibility: 'private', status: 'active',
  });
  created.rfqs.push(privateResult.rfq._id);
  assert(String(privateResult.rfq.sellerUserId) === String(sellerBUser._id) && privateResult.rfq.visibility === 'private', 'Private RFQ recipient or visibility regressed');
  assert(await Notification.exists({ eventKey: `private-rfq:${privateResult.rfq._id}:${sellerBUser._id}` }), 'Existing private RFQ notification regressed');
  assert(await Message.exists({ chatId: privateResult.chat._id, receiverId: sellerBUser._id, messageType: 'rfq' }), 'Existing private RFQ message regressed');

  console.log(JSON.stringify({ ok: true, directEnquiryRecipient: 'Seller A', publicRfqRecipient: 'Seller A', nonRecipients: ['Seller B', 'Seller C'], publicListing: true, privateRfqRegression: true }));
} finally {
  if (mongoose.connection.readyState) {
    const userIds = created.users;
    const rfqIds = created.rfqs;
    const chatIds = (await Chat.find({ $or: [{ buyerId: { $in: userIds } }, { sellerId: { $in: userIds } }] }).select('_id').lean()).map((item) => item._id);
    await Notification.deleteMany({ userId: { $in: userIds } });
    await Message.deleteMany({ $or: [{ chatId: { $in: chatIds } }, { senderId: { $in: userIds } }, { receiverId: { $in: userIds } }] });
    await Chat.deleteMany({ _id: { $in: chatIds } });
    await RFQ.deleteMany({ $or: [{ _id: { $in: rfqIds } }, { buyerId: { $in: userIds } }] });
    await Seller.deleteMany({ _id: { $in: created.sellers } });
    await User.deleteMany({ _id: { $in: userIds } });
    await Subcategory.deleteMany({ _id: { $in: created.subcategories } });
    await Category.deleteMany({ _id: { $in: created.categories } });
    await mongoose.disconnect();
  }
}
