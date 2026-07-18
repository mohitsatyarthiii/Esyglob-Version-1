import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { refundUsage } from '../src/lib/subscription-access.js';

const email = process.env.INSIGHTS_TEST_EMAIL;
const amount = Math.max(1, Math.min(10, Number(process.env.INSIGHTS_TEST_RESTORE_AMOUNT || 1)));
if (!email) throw new Error('Set INSIGHTS_TEST_EMAIL.');
await mongoose.connect(process.env.MONGODB_URI);
try {
  const user = await User.findOne({ email: email.toLowerCase() }).select('_id roles primaryRole');
  if (!user) throw new Error('Test user not found.');
  await refundUsage(user, 'marketInsights', amount, { role: 'buyer', ai: true });
  console.log(`Restored ${amount} automated Market Insights test usage unit(s).`);
} finally {
  await mongoose.disconnect();
}
