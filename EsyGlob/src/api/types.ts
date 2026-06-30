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
};

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
  productDetails?: Record<string, unknown> | Product | null;
  orderDetails?: Record<string, unknown> | Order | null;
  rfqDetails?: Record<string, unknown> | RFQ | null;
  quotationDetails?: Record<string, unknown> | Quotation | null;
};

export type ChatDetails = {
  chat?: Chat;
  messages?: MessageItem[];
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
  isRead?: boolean;
  createdAt?: string;
};
