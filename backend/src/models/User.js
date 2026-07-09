import mongoose from 'mongoose';
import { USER_ROLES } from '../lib/constants.js';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    avatarUrl: {
      type: String,
    },
    phone: {
      type: String,
      trim: true,
    },
    
    // Role Management
    roles: {
      type: [String],
      enum: Object.values(USER_ROLES),
      default: [USER_ROLES.BUYER],
    },
    primaryRole: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.BUYER,
      index: true,
    },
    
    // Account Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    banReason: {
      type: String,
    },
    
    // Metadata
    lastLoginAt: {
      type: Date,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    hasCompletedOnboarding: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
userSchema.index({ roles: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ fullName: 'text', firstName: 'text', lastName: 'text', email: 'text', phone: 'text' });
userSchema.index({ email: 1, phone: 1 });

// Virtual for full name
userSchema.virtual('displayName').get(function () {
  return this.fullName || this.firstName || this.email.split('@')[0];
});

// Methods
userSchema.methods.hasRole = function (role) {
  return this.roles.includes(role);
};

userSchema.methods.isAdmin = function () {
  return this.roles.includes(USER_ROLES.ADMIN);
};

userSchema.methods.isSeller = function () {
  return this.roles.includes(USER_ROLES.SELLER);
};

userSchema.methods.isBuyer = function () {
  return this.roles.includes(USER_ROLES.BUYER);
};

userSchema.methods.addRole = async function (role) {
  if (!this.roles.includes(role)) {
    this.roles.push(role);
    await this.save();
  }
  return this;
};

userSchema.methods.removeRole = async function (role) {
  this.roles = this.roles.filter(r => r !== role);
  await this.save();
  return this;
};

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
