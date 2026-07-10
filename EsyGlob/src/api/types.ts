export type UserRole = 'buyer' | 'seller' | 'admin' | string;

export type CurrentUser = {
  id?: string;
  _id?: string;
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  roles?: UserRole[];
  activeRole?: UserRole;
  sellerId?: string;
  buyerId?: string;
  profileImage?: string;
  avatar?: string;
  image?: string;
};

export type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  user?: CurrentUser;
  message?: string;
  error?: string;
  errors?: unknown;
  [key: string]: unknown;
};

export type Category = {
  _id?: string;
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  image?: string;
  icon?: string;
  subcategories?: Category[];
  productCount?: number;
  categoryId?: string;
  metadata?: {
    isFeatured?: boolean;
    sortOrder?: number;
    keywords?: string[];
  };
};

export type SellerSummary = {
  _id?: string;
  id?: string;
  companyName?: string;
  businessName?: string;
  displayName?: string;
  country?: string;
  address?: {
    country?: string;
    state?: string;
    city?: string;
  };
  verificationStatus?: string;
  isVerified?: boolean;
  trustScore?: number;
  rating?: number;
  responseRate?: number | string;
  yearsInBusiness?: number;
  supplierType?: string;
  productCount?: number;
  logo?: string;
  companyLogo?: string;
  logoUrl?: string;
  mainCategories?: string[];
  factoryVerified?: boolean;
  factoryImages?: string[];
  responseTime?: string;
  businessType?: string;
  companyType?: string;
  companyIntroduction?: string;
  description?: string;
  exportCountries?: string[];
  mainMarkets?: string[];
  minMoq?: number | string;
  addressLine?: string;
  factorySize?: string;
  factoryArea?: string;
  employeeCount?: number | string;
  establishedYear?: number | string;
  annualRevenue?: string;
  productionCapacity?: string;
  certifications?: string[] | string;
  gst?: string;
  businessLicense?: string;
  qualityControl?: string;
  packaging?: string;
  oemOdmSupport?: boolean | string;
  userId?: CurrentUser | string;
  trustedSeller?: boolean;
  isTrusted?: boolean;
  trustedBadgeActive?: boolean;
  isSuspended?: boolean;
  status?: string;
  isSaved?: boolean;
  isFavorited?: boolean;
  verificationLevel?: string;
};

export type Product = {
  _id?: string;
  id?: string;
  name?: string;
  title?: string;
  slug?: string;
  description?: string;
  images?: string[];
  image?: string;
  price?: number | string;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  moq?: number | string;
  minimumOrderQuantity?: number | string;
  unit?: string;
  seller?: SellerSummary | string;
  sellerId?: SellerSummary | string;
  category?: string;
  subcategory?: string;
  categoryId?: Category | string;
  country?: string;
  originCountry?: string;
  countryOfOrigin?: string;
  status?: string;
  averageRating?: number;
  reviewCount?: number;
  totalOrders?: number;
  responseRate?: number | string;
  createdAt?: string;
  samplePrice?: number | string;
  leadTime?: string;
  deliveryTime?: string;
  orderType?: string;
  productType?: string;
  paymentTerms?: string[] | string;
  tradeTerms?: string[] | string;
  warranty?: string | boolean;
  warrantyPeriod?: string;
  sampleAvailable?: boolean;
  directOrderEnabled?: boolean;
  orderEnabled?: boolean;
  trustedSellerOnly?: boolean;
  certifications?: string[] | string;
  packaging?: Record<string, unknown> | string;
  shipping?: Record<string, unknown> | string;
  manufacturingDetails?: Record<string, unknown> | string;
  factoryDetails?: Record<string, unknown> | string;
  priceTiers?: Array<{
    minQuantity?: number | string;
    maxQuantity?: number | string;
    price?: number | string;
    unit?: string;
  }>;
  variants?: Array<Record<string, unknown>>;
  isSaved?: boolean;
  isFavorited?: boolean;
  // Allow populated sellerId from backend
  [key: string]: unknown;
};

// ─── Saved Items (Standardized) ─────────────────────────────────────────────

/**
 * Standardized saved item type.
 * Backend stores 'supplier' in MongoDB enum.
 * Frontend uses this everywhere — NO 'seller' variant.
 */
export type SavedItemType = 'product' | 'supplier';

export type SavedItem = {
  _id?: string;
  id?: string;
  /** Always 'product' or 'supplier' */
  type?: SavedItemType;
  /** Backend may return itemType instead of type */
  itemType?: string;
  itemId?: string;
  /** Backend populates this as a Product object OR stores it as a string */
  productId?: string | Product;
  /** Backend populates this as a SellerSummary object OR stores it as a string */
  sellerId?: string | SellerSummary;
  item?: Product | SellerSummary;
  target?: Product | SellerSummary;
  product?: Product;
  seller?: SellerSummary;
  createdAt?: string;
  updatedAt?: string;
};

// ─── Rest of types unchanged ────────────────────────────────────────────────

export type Pagination = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

export type ProductListResponse = {
  products: Product[];
  pagination?: Pagination;
};

export type HomePayload = {
  categories?: Category[];
  featuredCategories?: Category[];
  popularCategories?: Category[];
  featuredProducts?: Product[];
  latestProducts?: Product[];
  trendingProducts?: Product[];
  recommendedProducts?: Product[];
};

export type RFQ = {
  _id?: string;
  id?: string;
  title?: string;
  productName?: string;
  status?: string;
  quantity?: number | string;
  unit?: string;
  destinationCountry?: string;
  deliveryCountry?: string;
  description?: string;
  category?: string;
  currency?: string;
  targetPrice?: number | string;
  deliveryTimeline?: string;
  deadline?: string;
  attachments?: string[];
  productId?: Product | string;
  sellerId?: SellerSummary | string;
  sellerUserId?: CurrentUser | string;
  chatId?: Chat | string;
  createdAt?: string;
  items?: Array<Record<string, unknown>>;
  customSpecifications?: string;
  customizationRequirements?: string;
  packagingRequirements?: string;
  deliveryRequirements?: string;
  additionalNotes?: string;
};

export type Quotation = {
  _id?: string;
  id?: string;
  title?: string;
  status?: string;
  rfqId?: RFQ | string;
  sellerId?: SellerSummary | string;
  productId?: Product | string;
  currency?: string;
  totalPrice?: number | string;
  unitPrice?: number | string;
  quantity?: number | string;
  unit?: string;
  leadTime?: string;
  deliveryTimeline?: string;
  paymentTerms?: string[] | string;
  tradeTerms?: string[] | string;
  validity?: string;
  notes?: string;
  attachments?: string[];
  chatId?: Chat | string;
  orderId?: Order | string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type SellerDetails = {
  seller?: SellerSummary;
  factoryProfile?: Record<string, unknown> | null;
  verification?: Record<string, unknown> | null;
  products?: Product[];
  pagination?: Pagination;
  reviews?: Record<string, unknown>[];
};

export type ReviewItem = {
  _id?: string;
  id?: string;
  userId?: CurrentUser | string;
  sellerId?: SellerSummary | string;
  productId?: Product | string;
  orderId?: Order | string;
  rating?: {
    overall?: number;
    quality?: number;
    communication?: number;
    shipping?: number;
    value?: number;
  };
  title?: string;
  comment?: string;
  images?: string[];
  verifiedPurchase?: boolean;
  sellerResponse?: {
    comment?: string;
    respondedAt?: string;
  };
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ReviewSummary = {
  reviews: ReviewItem[];
  averageRating: number;
  reviewCount: number;
  breakdown: Record<'5' | '4' | '3' | '2' | '1', number>;
};

export type RFQDetails = {
  rfq?: RFQ;
  quotations?: Quotation[];
  chats?: Chat[];
};

export type QuotationListResponse = {
  quotations: Quotation[];
  pagination?: Pagination;
};

export type Chat = {
  _id?: string;
  id?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  chatType?: string;
  buyerUnreadCount?: number;
  sellerUnreadCount?: number;
  isArchived?: boolean;
  isFavorite?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  isDeletedForMe?: boolean;
  groupName?: string;
  groupMembers?: Array<CurrentUser | string>;
  groupOwnerId?: CurrentUser | string;
  archivedFor?: string[];
  favoriteFor?: string[];
  pinnedFor?: string[];
  mutedFor?: string[];
  deletedFor?: string[];
  productId?: Product | string;
  rfqId?: RFQ | string;
  buyerId?: CurrentUser | string;
  sellerId?: CurrentUser | string;
  orderEligibility?: Array<{
    productId?: Product | string;
    enabledBy?: CurrentUser | string;
    enabledAt?: string;
    isActive?: boolean;
  }>;
  quotationId?: Quotation | string;
  isActive?: boolean;
};

export type MessageItem = {
  _id?: string;
  id?: string;
  chatId?: string;
  senderId?: CurrentUser | string;
  content?: string;
  text?: string;
  messageType?: string;
  attachments?: string[];
  createdAt?: string;
  updatedAt?: string;
  readAt?: string;
  actionType?: string;
  localStatus?: 'sending' | 'sent' | 'failed';
  productDetails?: Record<string, unknown> | Product | null;
  orderDetails?: Record<string, unknown> | Order | null;
  rfqDetails?: Record<string, unknown> | RFQ | null;
  quotationDetails?: Record<string, unknown> | Quotation | null;
};

export type ChatDetails = {
  chat?: Chat;
  messages?: MessageItem[];
  pagination?: {
    hasOlder?: boolean;
    before?: string;
    after?: string;
  };
  sellerProfile?: SellerSummary;
  sellerProducts?: Product[];
  rfqProducts?: Product[];
};

export type CheckoutQuote = {
  subtotal?: number;
  total?: number;
  totalAmount?: number;
  currency?: string;
  logisticsOptions?: Array<{ id?: string; code?: string; name?: string; amount?: number; price?: number }>;
  [key: string]: unknown;
};

export type Order = {
  _id?: string;
  id?: string;
  orderNumber?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  orderType?: string;
  orderSubType?: string;
  productId?: Product | string;
  products?: Product[] | Array<Record<string, unknown>>;
  sellerId?: SellerSummary | string;
  buyerId?: CurrentUser | string;
  rfqId?: RFQ | string;
  quotationId?: Quotation | string;
  chatId?: Chat | string;
  totalAmount?: number | string;
  currency?: string;
  timeline?: Array<Record<string, unknown>>;
  trackingNumber?: string;
  estimatedDeliveryDate?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type PaymentInitiation = {
  razorpayOrderId?: string;
  amount?: number;
  currency?: string;
  paymentId?: string;
  keyId?: string;
  orderNumber?: string;
};

export type NotificationItem = {
  _id?: string;
  id?: string;
  title?: string;
  message?: string;
  type?: string;
  notificationType?: string;
  category?: string;
  status?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  link?: string;
  actionUrl?: string;
  orderId?: string | Order;
  productId?: string | Product;
  sellerId?: string | SellerSummary;
  chatId?: string | Chat;
  rfqId?: string | RFQ;
  quotationId?: string | Quotation;
  isRead?: boolean;
  createdAt?: string;
};


// ─── Add at the bottom of your types.ts file ───────────────────────────────

// Product Details Screen specific types
export type ProductDetails = Product & {
  specifications?: Record<string, string>;
  tags?: string[];
  leadTime?: {
    value: number;
    unit: string;
  };
};

// MOQ Tier for price selection
export type MoqTier = {
  minQty: number;
  maxQty: number | null;
  price: number;
  currency?: string;
  unit?: string;
};

// RFQ / Enquiry form data
export type EnquiryFormData = {
  productId: string;
  sellerUserId: string;
  productName: string;
  quantity: number;
  unit: string;
  targetPrice?: number;
  destinationCountry: string;
  additionalNotes?: string;
  attachments?: string[];
};

// Chat start params
export type StartChatParams = {
  otherUserId: string;
  productId: string;
  role: 'buyer' | 'seller';
  enquiry: boolean;
};

// Product Enquiry Response
export type EnquiryResponse = {
  rfq?: RFQ;
  chat?: Chat;
  message?: string;
};

// Track Product View Response
export type TrackViewResponse = {
  tracked: boolean;
};

// Sample Order Params
export type SampleOrderParams = {
  productId: string;
  quantity: number;
  shippingAddress: {
    country: string;
    city: string;
    postalCode: string;
  };
  logisticsOption?: string;
  notes?: string;
  termsAccepted?: boolean;
};

// Trade Order Params
export type TradeOrderParams = {
  productId: string;
  quantity: number;
  destination: {
    country: string;
    city: string;
    postalCode: string;
  };
  logisticsOption?: string;
  quotationId?: string;
  chatId?: string;
  orderType: 'bulk' | 'sample';
  orderSubType: string;
  notes?: string;
  termsAccepted?: boolean;
};

// Upload Response
export type UploadResponse = {
  uploads?: UploadAttachment[];
  files?: UploadAttachment[];
  data?: UploadAttachment[];
  urls?: string[];
};

export type UploadAttachment = {
  id?: string;
  url?: string;
  secure_url?: string;
  location?: string;
  name?: string;
  mimeType?: string;
  size?: number;
};

// Factory Profile types
export type FactoryProfileData = {
  name?: string;
  factoryName?: string;
  floorArea?: string;
  factorySize?: string;
  employeeCount?: number;
  productionLines?: number;
  machinery?: string;
  monthlyCapacity?: string;
  productionCapacity?: string;
  annualCapacity?: string;
  qualityControl?: string;
  description?: string;
  capabilities?: string[] | string;
  images?: string[] | string;
  videos?: string[] | string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  verificationStatus?: string;
  lastDraftSavedAt?: string;
};

// Checkout Quote Types
export type CheckoutQuoteInput = {
  productId: string;
  quantity: number;
  orderType: string;
  orderSubType: string;
  logisticsOption?: string;
  destination?: {
    country: string;
    city: string;
    postalCode: string;
  };
};

export type LogisticsOption = {
  key?: string;
  id?: string;
  code?: string;
  label?: string;
  name?: string;
  mode?: string;
  incoterm?: string;
  eta?: string;
  estimatedDelivery?: string;
  amount?: number;
  price?: number;
  buyerLabel?: string;
  available?: boolean;
  insuranceAmount?: number;
  warehousingCharges?: number;
  customsCharges?: number;
  internalBreakdown?: Record<string, number>;
  providerLabel?: string;
  providerKey?: string;
};

export type CheckoutQuoteResponse = {
  success?: boolean;
  quote?: {
    currency?: string;
    quantity?: number;
    unitPrice?: number;
    productTotal?: number;
    logisticsOptions?: LogisticsOption[];
    selectedLogistics?: LogisticsOption | null;
    logisticsCharges?: number;
    platformFee?: number;
    platformFeeRate?: number;
    gstRate?: number;
    gstAmount?: number;
    discount?: number;
    grandTotal?: number;
    subtotal?: number;
    totalAmount?: number;
    automatedServices?: Array<{
      key: string;
      label: string;
      status: string;
      amount: number;
    }>;
  };
};