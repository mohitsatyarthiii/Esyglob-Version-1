import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], required: true }, // [longitude, latitude]
});

const locationHistorySchema = new mongoose.Schema({
  location: { type: pointSchema, required: true },
  accuracy: { type: Number },
  timestamp: { type: Date, default: Date.now },
});

const userLocationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    current: {
      type: pointSchema,
      required: true,
    },
    accuracy: { type: Number },
    altitude: { type: Number },
    speed: { type: Number },
    heading: { type: Number },
    address: {
      formatted: { type: String },
      street: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String },
      postalCode: { type: String },
    },
    lastUpdated: { type: Date, default: Date.now },
    history: [locationHistorySchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Geospatial index for location queries
userLocationSchema.index({ current: '2dsphere' });
userLocationSchema.index({ userId: 1, lastUpdated: -1 });

// Keep only last 100 history entries
userLocationSchema.pre('save', function (next) {
  if (this.history && this.history.length > 100) {
    this.history = this.history.slice(-100);
  }
  next();
});

export default mongoose.models.UserLocation || mongoose.model('UserLocation', userLocationSchema);