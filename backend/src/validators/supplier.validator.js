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
    .optional()
    .default({}),
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
    )]).optional().default([]),
  monthlyCapacity: z.string().trim().optional(),
  annualCapacity: z.string().trim().optional(),
  capabilities: z.array(z.string().trim()).optional().default([]),
  qualityControl: z.string().trim().optional(),
  qualityProcesses: z.array(z.string().trim()).optional().default([]),
  exportMarkets: z.array(z.string().trim()).optional().default([]),
  certifications: z.array(z.unknown()).optional().default([]),
  images: z.array(z.string().trim()).optional().default([]),
  videos: z.array(z.string().trim()).optional().default([]),
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
  gstNumber: z.string().trim().max(32).optional(),
  panNumber: z.string().trim().max(32).optional(),
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
