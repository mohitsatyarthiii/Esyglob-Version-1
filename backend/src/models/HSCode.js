import mongoose from 'mongoose';

const countryExtensionSchema = new mongoose.Schema({
  countryCode: { type: String, uppercase: true, trim: true, required: true },
  nationalCode: { type: String, trim: true },
  description: String,
  importNotes: [String],
  exportNotes: [String],
  certifications: [String],
  tariffReferences: [{ label: String, url: String, rate: Number, currency: String, validFrom: Date, validTo: Date, source: String }],
  metadata: mongoose.Schema.Types.Mixed,
}, { _id: false });

const hsCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, index: true, match: /^\d{2,10}$/ },
  officialDescription: { type: String, required: true, trim: true },
  nomenclature: { type: String, default: 'HS', trim: true },
  revision: { type: String, default: 'HS 2022', trim: true, index: true },
  level: { type: Number, min: 2, max: 10, index: true },
  section: { code: String, title: String },
  chapter: { code: String, title: String },
  heading: { code: String, title: String },
  subheading: { code: String, title: String },
  category: { type: String, trim: true, index: true },
  industry: [{ type: String, trim: true }],
  keywords: [{ type: String, trim: true, lowercase: true }],
  synonyms: [{ type: String, trim: true, lowercase: true }],
  commonProductNames: [{ type: String, trim: true }],
  searchTerms: [{ type: String, trim: true, lowercase: true }],
  relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true }],
  parentHsCode: { type: mongoose.Schema.Types.ObjectId, ref: 'HSCode', index: true },
  childHsCodes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HSCode' }],
  relatedHsCodes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HSCode' }],
  importNotes: [String],
  exportNotes: [String],
  commonApplications: [String],
  applicableCertifications: [{ name: String, authority: String, countries: [String], notes: String, sourceUrl: String }],
  tariffReferences: [{ countryCode: String, tariffType: String, rate: Number, unit: String, source: String, sourceUrl: String, validFrom: Date, validTo: Date }],
  countrySpecificExtensions: [countryExtensionSchema],
  searchableText: { type: String, default: '' },
  embedding: { type: [Number], select: false, default: undefined },
  embeddingModel: { type: String, select: false },
  embeddingVersion: { type: Number, select: false, default: 0 },
  status: { type: String, enum: ['active', 'deprecated', 'draft'], default: 'active', index: true },
  effectiveFrom: Date,
  effectiveTo: Date,
  source: { name: String, url: String, authority: String, retrievedAt: Date },
  metadata: { datasetVersion: String, language: { type: String, default: 'en' }, confidence: Number, reviewedAt: Date, reviewedBy: mongoose.Schema.Types.ObjectId, extra: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

hsCodeSchema.pre('validate', function setDerivedFields(next) {
  this.code = String(this.code || '').replace(/\D/g, '');
  this.level = this.code.length;
  this.searchableText = [this.code, this.officialDescription, this.category, ...(this.industry || []), ...(this.keywords || []), ...(this.synonyms || []), ...(this.commonProductNames || []), ...(this.searchTerms || [])].filter(Boolean).join(' ').toLowerCase();
  
});
hsCodeSchema.index({ officialDescription: 'text', searchableText: 'text', keywords: 'text', synonyms: 'text', commonProductNames: 'text' }, { weights: { officialDescription: 10, commonProductNames: 8, keywords: 5, synonyms: 4, searchableText: 2 }, name: 'hs_code_text_search' });
hsCodeSchema.index({ code: 1, revision: 1 }, { unique: true });
hsCodeSchema.index({ 'chapter.code': 1, 'heading.code': 1, status: 1 });
hsCodeSchema.index({ category: 1, industry: 1, status: 1 });
hsCodeSchema.index({ 'countrySpecificExtensions.countryCode': 1, code: 1 });

export default mongoose.models.HSCode || mongoose.model('HSCode', hsCodeSchema);
