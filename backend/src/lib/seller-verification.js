export function getSellerCompletionSummary(seller) {
  if (!seller) {
    return {
      completedCount: 0,
      totalCount: 0,
      completedFields: [],
      remainingFields: [],
    };
  }

  const fields = [
    { key: 'companyName', label: 'Company Name', value: seller.companyName },
    { key: 'companyType', label: 'Company Type', value: seller.companyType },
    { key: 'companyDescription', label: 'Company Description', value: seller.companyDescription },
    { key: 'companyLogo', label: 'Company Logo', value: seller.companyLogo || seller.logoUrl || seller.logo },
    { key: 'companyWebsite', label: 'Company Website', value: seller.companyWebsite },
    { key: 'yearEstablished', label: 'Year Established', value: seller.yearEstablished },
    { key: 'employeeCount', label: 'Employee Count', value: seller.employeeCount },
    { key: 'gstNumber', label: 'GST Number', value: seller.gstNumber },
    { key: 'panNumber', label: 'PAN Number', value: seller.panNumber },
    { key: 'businessRegistrationNumber', label: 'Business Registration', value: seller.businessRegistrationNumber },
    { key: 'importExportCode', label: 'Import Export Code', value: seller.importExportCode },
    { key: 'businessEmail', label: 'Business Email', value: seller.businessEmail },
    { key: 'businessPhone', label: 'Business Phone', value: seller.businessPhone },
    { key: 'address', label: 'Address', value: seller.address?.city || seller.address?.state },
    { key: 'bankDetails', label: 'Bank Details', value: seller.bankDetails?.accountNumber },
  ];

  const completedFields = fields.filter((f) => {
    const val = f.value;
    return val !== null && val !== undefined && val !== '';
  });

  const remainingFields = fields.filter((f) => {
    const val = f.value;
    return val === null || val === undefined || val === '';
  });

  return {
    completedCount: completedFields.length,
    totalCount: fields.length,
    completedFields: completedFields.map(({ key, label }) => ({ key, label })),
    remainingFields: remainingFields.map(({ key, label }) => ({ key, label })),
  };
}


export const SELLER_REQUIRED_FIELDS = [
  { key: 'companyName', label: 'Company name', path: ['companyName'] },
  { key: 'companyType', label: 'Company type', path: ['companyType'] },
  { key: 'businessEmail', label: 'Business email', path: ['businessEmail'] },
  { key: 'businessPhone', label: 'Business phone', path: ['businessPhone'] },
  { key: 'street', label: 'Street address', path: ['address', 'street'] },
  { key: 'city', label: 'City', path: ['address', 'city'] },
  { key: 'state', label: 'State', path: ['address', 'state'] },
  { key: 'country', label: 'Country', path: ['address', 'country'] },
  { key: 'pincode', label: 'Pincode', path: ['address', 'pincode'] },
];

function getValue(source, path) {
  return path.reduce((current, segment) => current?.[segment], source);
}

export function getSellerFieldChecklist(seller) {
  return SELLER_REQUIRED_FIELDS.map((field) => {
    const value = getValue(seller, field.path);

    return {
      key: field.key,
      label: field.label,
      isComplete: Boolean(typeof value === 'string' ? value.trim() : value),
    };
  });
}

