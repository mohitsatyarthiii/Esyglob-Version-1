export const VERIFICATION_LEVELS = [
  'Unverified',
  'Basic Verified',
  'Verified Supplier',
  'Premium Supplier',
  'Gold Supplier',
  'Diamond Supplier',
  'Enterprise Supplier',
];

export const VERIFICATION_STEPS = [
  { key: 'company', aliases: ['business'], requiredFields: ['companyName', 'companyType', 'yearEstablished', 'businessEmail', 'businessPhone', 'companyDescription'] },
  { key: 'registration', aliases: ['legal', 'trade'], requiredFields: ['gstNumber', 'panNumber'], documentTypes: ['incorporation_certificate', 'business_registration', 'gst_certificate', 'pan_card'] },
  { key: 'identity', documentTypes: ['government_id', 'government_id_front', 'passport', 'driving_license', 'national_identity_card', 'director_id'] },
  { key: 'address', documentTypes: ['address_proof', 'utility_bill', 'office_address_proof', 'lease_agreement'] },
  { key: 'factory', manufacturerOnly: true, documentTypes: ['factory_license', 'factory_image', 'production_line_image', 'machinery_image'] },
  { key: 'certifications', documentTypes: ['certification', 'quality_certificate'] },
  { key: 'bank', requiredFields: ['bankName', 'accountHolderName', 'accountNumber', 'ifscCode'], documentTypes: ['cancelled_cheque', 'bank_certificate'] },
  { key: 'review' },
];

const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';

export function buildVerificationCenterSummary(seller, verification) {
  const stepData = verification?.stepData || {};
  const documents = (verification?.documents || []).filter(document => document.status !== 'archived');
  const latestByType = new Map();
  documents.forEach(document => {
    const existing = latestByType.get(document.type);
    if (!existing || Number(document.version || 1) >= Number(existing.version || 1)) latestByType.set(document.type, document);
  });
  const latestDocuments = [...latestByType.values()];
  const approved = latestDocuments.filter(document => ['approved', 'verified'].includes(document.status));
  const pending = latestDocuments.filter(document => ['pending', 'under_review'].includes(document.status));
  const rejected = latestDocuments.filter(document => ['rejected', 'needs_update', 'expired'].includes(document.status));

  const completedSteps = VERIFICATION_STEPS.flatMap((step, index) => {
    if (step.key === 'review') return ['submitted', 'under_review', 'document_review', 'factory_inspection_scheduled', 'approved'].includes(verification?.status) ? [index] : [];
    if (step.manufacturerOnly && seller?.companyType !== 'manufacturer') return [index];
    const aliasData = (step.aliases || []).reduce((result, alias) => ({ ...result, ...(stepData[alias] || {}) }), {});
    const data = { ...aliasData, ...(stepData[step.key] || {}), ...(index === 0 ? seller?.toObject?.() || seller || {} : {}) };
    const fieldsComplete = (step.requiredFields || []).every(field => hasValue(data[field]));
    const documentComplete = !(step.documentTypes || []).length || (step.documentTypes || []).some(type => approved.some(document => document.type === type));
    return fieldsComplete && documentComplete ? [index] : [];
  });
  const businessFields = VERIFICATION_STEPS[0].requiredFields;
  const businessComplete = businessFields.filter(field => hasValue(seller?.[field] ?? stepData.company?.[field] ?? stepData.business?.[field])).length;
  const businessScore = Math.round((businessComplete / businessFields.length) * 100);
  const tradeTypes = new Set([...VERIFICATION_STEPS[1].documentTypes, ...VERIFICATION_STEPS[2].documentTypes, ...VERIFICATION_STEPS[3].documentTypes, ...VERIFICATION_STEPS[5].documentTypes]);
  const tradeDocuments = approved.filter(document => tradeTypes.has(document.type)).length;
  const tradeReadinessScore = Math.min(100, Math.round((tradeDocuments / 6) * 100));
  const factoryTypes = new Set(VERIFICATION_STEPS[4].documentTypes);
  const factoryDocuments = approved.filter(document => factoryTypes.has(document.type)).length;
  const serviceReadinessScore = seller?.companyType === 'manufacturer' ? Math.min(100, Math.round((factoryDocuments / 4) * 100)) : 100;
  const overallTrustScore = Math.round(businessScore * 0.45 + tradeReadinessScore * 0.4 + serviceReadinessScore * 0.15);
  const verificationLevel = overallTrustScore >= 95 ? 6 : overallTrustScore >= 85 ? 5 : overallTrustScore >= 70 ? 4 : overallTrustScore >= 55 ? 3 : overallTrustScore >= 40 ? 2 : overallTrustScore >= 20 ? 1 : 0;
  const allRequiredTypes = new Set(VERIFICATION_STEPS.flatMap(step => step.documentTypes || []));
  const missingDocuments = [...allRequiredTypes].filter(type => !latestByType.has(type)).length;
  const completionPercentage = Math.round((completedSteps.length / VERIFICATION_STEPS.length) * 100);

  return {
    currentStep: Math.min(Number(verification?.currentStep ?? completedSteps.length), 7),
    completedSteps,
    rejectedSteps: [...new Set(rejected.map(document => VERIFICATION_STEPS.findIndex(step => step.documentTypes?.includes(document.type))).filter(index => index >= 0))],
    completionPercentage,
    businessScore,
    tradeReadinessScore,
    serviceReadinessScore,
    overallTrustScore,
    verificationLevel,
    currentLevel: VERIFICATION_LEVELS[verificationLevel],
    nextLevel: VERIFICATION_LEVELS[Math.min(verificationLevel + 1, VERIFICATION_LEVELS.length - 1)],
    estimatedMinutesRemaining: Math.max(0, (VERIFICATION_STEPS.length - completedSteps.length) * 8),
    documentCounts: { pending: pending.length, verified: approved.length, rejected: rejected.length, missing: missingDocuments },
    lastSavedAt: verification?.lastSavedAt || verification?.updatedAt || seller?.onboardingDraftSavedAt,
  };
}
