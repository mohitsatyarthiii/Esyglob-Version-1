import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: {
    type: [Number],
    validate: value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite),
  },
}, { _id: false });

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    fullName: { type: String, trim: true },
    companyName: { type: String, trim: true },
    phone: { type: String, trim: true },
    country: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    city: { type: String, trim: true },
    district: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    address: { type: String, required: true, trim: true },
    street: { type: String, trim: true },
    countryCode: { type: String, trim: true, uppercase: true },
    placeId: { type: String, trim: true },
    latitude: Number,
    longitude: Number,
    coordinates: { type: pointSchema, default: undefined },
    gpsAccuracy: Number,
    locationSource: { type: String, enum: ['manual', 'autocomplete', 'gps', 'legacy'], default: 'manual' },
    lastLocatedAt: Date,
    addressLabel: { type: String, enum: ['Home', 'Office', 'Warehouse', 'Other'], default: 'Other' },
    landmark: { type: String, trim: true },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

addressSchema.index({ userId: 1, isDefault: -1, updatedAt: -1 });
addressSchema.index({ coordinates: '2dsphere' }, { sparse: true });
addressSchema.index({ userId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

addressSchema.pre('validate', function syncCoordinates() {
  if (Number.isFinite(this.latitude) && Number.isFinite(this.longitude)) {
    this.coordinates = { type: 'Point', coordinates: [this.longitude, this.latitude] };
  }
});

export default mongoose.models.Address || mongoose.model('Address', addressSchema);
