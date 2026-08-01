import Category from '../models/Category.js';
import Certification from '../models/Certification.js';
import Document from '../models/Document.js';
import FactoryProfile from '../models/FactoryProfile.js';
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import RFQ from '../models/RFQ.js';
import Seller from '../models/Seller.js';
import SellerVerification from '../models/SellerVerification.js';
import Subcategory from '../models/Subcategory.js';
import User from '../models/User.js';
import WarehouseInventory from '../models/WarehouseInventory.js';

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function storageUrlPattern(storageKey) {
  const encoded = String(storageKey || '').split('/').map(encodeURIComponent).join('/');
  return new RegExp(`/storage/${escapeRegExp(encoded)}$`, 'i');
}

export default class MediaReferenceService {
  static async isReferenced(storageKey) {
    const url = storageUrlPattern(storageKey);
    const checks = [
      Category.exists({ image: url }),
      Subcategory.exists({ image: url }),
      Product.exists({ $or: [{ images: url }, { 'videos.url': url }, { 'videos.thumbnailUrl': url }, { 'variants.images': url }, { 'certifications.documentUrl': url }] }),
      User.exists({ avatarUrl: url }),
      Seller.exists({ $or: [{ companyLogo: url }, { coverImage: url }, { companyPhotos: url }, { companyVideos: url }, { brochures: url }, { logoUrl: url }, { logo: url }, { 'certifications.documentUrl': url }] }),
      FactoryProfile.exists({ $or: [{ images: url }, { videos: url }, { 'inspection.reportUrl': url }] }),
      SellerVerification.exists({ $or: [{ 'documents.storageKey': storageKey }, { 'documents.url': url }, { assessmentReportUrl: url }, { publicVerificationVideoUrl: url }] }),
      Document.exists({ fileUrl: url }),
      Certification.exists({ documentUrl: url }),
      Review.exists({ images: url }),
      RFQ.exists({ $or: [{ 'attachments.url': url }, { 'images.url': url }, { 'documents.url': url }] }),
      WarehouseInventory.exists({ images: url }),
    ];
    const results = await Promise.all(checks);
    return results.some(Boolean);
  }
}
