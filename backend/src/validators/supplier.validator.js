import { z } from 'zod';

export const factorySchema = z.object({
  name: z.string().trim().optional(),
  address: z
    .object({
      street: z.string().trim().optional(),
      city: z.string().trim().optional(),
      state: z.string().trim().optional(),
      country: z.string().trim().optional(),
      pincode: z.string().trim().optional(),
    })
    .optional(),
  floorArea: z.string().trim().optional(),
  description: z.string().trim().optional(),
  employeeCount: z.coerce.number().min(0).optional(),
  productionLines: z.coerce.number().min(0).optional(),
  machinery: z.union([
    z.string().trim().transform(value => value ? [{ name: value, quantity: 1 }] : []),
    z
    .array(
      z.object({
        name: z.string().trim().min(1),
        quantity: z.coerce.number().min(1),
        model: z.string().trim().optional(),
        year: z.coerce.number().optional(),
      })
    )]).optional(),
  monthlyCapacity: z.string().trim().optional(),
  annualCapacity: z.string().trim().optional(),
  capabilities: z.array(z.string().trim()).optional(),
  qualityControl: z.string().trim().optional(),
  qualityProcesses: z.array(z.string().trim()).optional(),
  exportMarkets: z.array(z.string().trim()).optional(),
  certifications: z.array(z.unknown()).optional(),
  images: z.array(z.string().trim()).optional(),
  videos: z.array(z.string().trim()).optional(),
});

export const onboardingSchema = z.object({
  companyName: z.string().trim().min(2),
  companyType: z.enum([
    'manufacturer',
    'wholesaler',
    'distributor',
    'trader',
    'exporter',
    'other',
  ]),
  businessEmail: z.string().trim().email(),
  businessPhone: z.string().trim().min(8),
  gstNumber: z.string().trim().optional(),
  panNumber: z.string().trim().optional(),
  address: z.object({
    street: z.string().trim().min(2),
    city: z.string().trim().min(2),
    state: z.string().trim().min(2),
    country: z.string().trim().min(2),
    pincode: z.string().trim().min(4),
  }),
});

export const onboardingDraftSchema = z.object({
  companyName: z.string().trim().max(200).optional(),
  companyType: z
    .enum([
      'manufacturer',
      'wholesaler',
      'distributor',
      'trader',
      'exporter',
      'other',
    ])
    .optional(),
  businessEmail: z.string().trim().max(320).optional(),
  businessPhone: z.string().trim().max(40).optional(),
  companyDescription: z.string().trim().max(4000).optional(),
  companyWebsite: z.string().trim().max(400).optional(),
  companyLogo: z.string().trim().max(1000).optional(),
  coverImage: z.string().trim().max(1000).optional(),
  companyPhotos: z.array(z.string().trim().max(1000)).max(40).optional(),
  companyVideos: z.array(z.string().trim().max(1000)).max(20).optional(),
  brochures: z.array(z.string().trim().max(1000)).max(20).optional(),
  yearEstablished: z.coerce.number().int().min(1800).max(new Date().getFullYear()).optional(),
  employeeCount: z.enum(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']).optional(),
  gstNumber: z.string().trim().max(32).optional(),
  panNumber: z.string().trim().max(32).optional(),
  businessRegistrationNumber: z.string().trim().max(100).optional(),
  importExportCode: z.string().trim().max(100).optional(),
  productCategories: z.array(z.string().trim().max(120)).max(40).optional(),
  productSubcategories: z.array(z.string().trim().max(120)).max(80).optional(),
  industries: z.array(z.string().trim().max(120)).max(40).optional(),
  mainProducts: z.array(z.string().trim().max(160)).max(80).optional(),
  exportMarkets: z.array(z.string().trim().max(120)).max(80).optional(),
  languages: z.array(z.string().trim().max(80)).max(30).optional(),
  certifications: z.array(z.object({
    name: z.string().trim().max(160),
    issuer: z.string().trim().max(160).optional(),
    validUntil: z.string().trim().max(40).optional(),
    documentUrl: z.string().trim().max(1000).optional(),
    status: z.string().trim().max(40).optional(),
  })).max(50).optional(),
  socialLinks: z.object({
    linkedin: z.string().trim().max(400).optional(),
    facebook: z.string().trim().max(400).optional(),
    instagram: z.string().trim().max(400).optional(),
    youtube: z.string().trim().max(400).optional(),
  }).optional(),
  teamContacts: z.array(z.object({
    name: z.string().trim().max(160).optional(),
    designation: z.string().trim().max(160).optional(),
    email: z.string().trim().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
  })).max(20).optional(),
  shippingInfo: z.object({
    originPort: z.string().trim().max(160).optional(),
    preferredCarriers: z.array(z.string().trim().max(120)).max(30).optional(),
    exportCountries: z.array(z.string().trim().max(120)).max(80).optional(),
    handlingTime: z.string().trim().max(160).optional(),
    shippingSupport: z.array(z.string().trim().max(120)).max(30).optional(),
  }).optional(),
  tradeCapabilities: z.object({
    oem: z.boolean().optional(),
    odm: z.boolean().optional(),
    privateLabel: z.boolean().optional(),
    minimumOrderQuantity: z.string().trim().max(120).optional(),
    productionLeadTime: z.string().trim().max(160).optional(),
    qualityAssurance: z.string().trim().max(1000).optional(),
    rdCapability: z.string().trim().max(1000).optional(),
  }).optional(),
  address: z
    .object({
      street: z.string().trim().max(300).optional(),
      city: z.string().trim().max(120).optional(),
      state: z.string().trim().max(120).optional(),
      country: z.string().trim().max(120).optional(),
      pincode: z.string().trim().max(20).optional(),
    })
    .optional(),
  verificationCenter: z
    .object({
      currentStep: z.coerce.number().int().min(0).max(7).optional(),
      completedSteps: z.array(z.coerce.number().int().min(0).max(7)).optional(),
      stepData: z.record(z.string(), z.unknown()).optional(),
      submitForReview: z.boolean().optional(),
    })
    .optional(),
});
