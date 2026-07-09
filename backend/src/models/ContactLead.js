import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    body: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const contactLeadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true,
      maxlength: 120,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
      maxlength: 160,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 40,
    },
    company: {
      type: String,
      trim: true,
      maxlength: 160,
      index: true,
    },
    subject: {
      type: String,
      trim: true,
      required: true,
      maxlength: 160,
      index: true,
    },
    message: {
      type: String,
      trim: true,
      required: true,
      maxlength: 5000,
    },
    country: {
      type: String,
      trim: true,
      maxlength: 80,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    ip: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'closed'],
      default: 'new',
      index: true,
    },
    notes: [noteSchema],
    source: {
      type: String,
      trim: true,
      default: 'contact_page',
    },
  },
  { timestamps: true }
);

contactLeadSchema.index({ createdAt: -1 });
contactLeadSchema.index({ status: 1, createdAt: -1 });
contactLeadSchema.index({
  name: 'text',
  email: 'text',
  company: 'text',
  subject: 'text',
  message: 'text',
  country: 'text',
});

export default mongoose.models.ContactLead || mongoose.model('ContactLead', contactLeadSchema);
