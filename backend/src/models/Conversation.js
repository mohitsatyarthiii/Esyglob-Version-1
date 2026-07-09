// models/Conversation.js
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Related Entity
  relatedTo: {
    type: { type: String, enum: ['order', 'escrow', 'shipping', 'inspection', 'dispute', 'general'] },
    id: mongoose.Schema.Types.ObjectId
  },
  
  // Conversation Info
  subject: String,
  
  // Last Message
  lastMessage: {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    createdAt: Date
  },
  
  // Unread Count
  unreadCount: {
    type: Map,
    of: Number,
    default: {}
  },
  
  // Status
  status: { type: String, enum: ['active', 'archived', 'closed'], default: 'active' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

conversationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);