import * as XLSX from 'xlsx';

export const BULK_PRODUCT_HEADERS = [
  'Product Name',
  'Description',
  'Category',
  'Subcategory',
  'MOQ',
  'Unit',
  'Price',
  'Currency',
  'Product Type',
  'Brand',
  'Country Of Origin',
  'Stock Quantity',
  'Lead Time',
  'Delivery Time',
  'Specifications',
  'Product Attributes',
  'Certifications',
  'Product Images',
  'Product Videos',
  'Tags',
  'Payment Terms',
  'Order Type',
  'Visibility',
  'Sample Available',
  'Sample Price',
  'Shipping Available',
  'Origin Port',
  'Shipping Methods',
  'Shipping Countries',
  'Shipping Estimate',
  'Warranty',
  'Warranty Period',
  'SEO Title',
  'SEO Description',
  'SEO Keywords',
];

const FIELD_ALIASES = {
  name: ['product name', 'name', 'title'],
  description: ['description', 'product description'],
  category: ['category'],
  subcategory: ['subcategory', 'sub category'],
  minimumOrderQuantity: ['moq', 'minimum order quantity', 'minimumorderquantity'],
  unit: ['unit', 'uom'],
  price: ['price', 'unit price'],
  currency: ['currency'],
  productType: ['product type', 'producttype'],
  specifications: ['specifications', 'specs'],
  productAttributes: ['product attributes', 'attributes'],
  certifications: ['certifications', 'certificates'],
  brand: ['brand'],
  countryOfOrigin: ['country of origin', 'origin country', 'countryoforigin'],
  leadTime: ['lead time', 'leadtime'],
  deliveryTime: ['delivery time', 'deliverytime'],
  stockQuantity: ['stock quantity', 'stock', 'inventory'],
  images: ['product images', 'images', 'image urls'],
  videos: ['product videos', 'videos', 'video urls'],
  tags: ['tags', 'keywords'],
  paymentTerms: ['payment terms', 'paymentterms'],
  orderType: ['order type', 'order mode', 'ordertype'],
  visibility: ['visibility'],
  sampleAvailable: ['sample available', 'sampleavailable'],
  samplePrice: ['sample price', 'sampleprice'],
  shippingAvailable: ['shipping available', 'shippingavailable'],
  originPort: ['origin port', 'originport'],
  shippingMethods: ['shipping methods', 'shippingmethods'],
  shippingCountries: ['shipping countries', 'shippingcountries'],
  shippingEstimate: ['shipping estimate', 'shippingestimate'],
  warranty: ['warranty'],
  warrantyPeriod: ['warranty period', 'warrantyperiod'],
  seoTitle: ['seo title', 'seotitle'],
  seoDescription: ['seo description', 'seodescription'],
  seoKeywords: ['seo keywords', 'seokeywords'],
};

function normalizeMatch(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function splitList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(/[|,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function parseBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined || value === '') return defaultValue;
  return ['true', 'yes', 'y', '1', 'available'].includes(String(value).trim().toLowerCase());
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return {};
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      // Fall through to the human-friendly Key:Value syntax.
    }
  }
  return text.split(/[|;]/).reduce((result, item) => {
    const [key, ...rest] = item.split(/[:=]/);
    if (key?.trim() && rest.length) result[key.trim()] = rest.join(':').trim();
    return result;
  }, {});
}

function normalizeRow(row) {
  const mapped = {};
  const entries = Object.entries(row || {}).map(([key, value]) => [normalizeMatch(key), value]);

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const match = entries.find(([key]) => aliases.some((alias) => normalizeMatch(alias) === key));
    mapped[field] = match?.[1] ?? '';
  }

  const leadTime = parseNumber(mapped.leadTime) ?? 0;
  return {
    name: String(mapped.name || '').trim(),
    description: String(mapped.description || '').trim(),
    category: String(mapped.category || '').trim(),
    subcategory: String(mapped.subcategory || '').trim(),
    minimumOrderQuantity: parseNumber(mapped.minimumOrderQuantity),
    unit: String(mapped.unit || 'piece').trim().toLowerCase() || 'piece',
    price: parseNumber(mapped.price),
    currency: String(mapped.currency || 'INR').trim().toUpperCase() || 'INR',
    productType: String(mapped.productType || '').trim(),
    specifications: parseObject(mapped.specifications),
    productAttributes: parseObject(mapped.productAttributes),
    certifications: splitList(mapped.certifications).map((name) => ({ name })),
    brand: String(mapped.brand || '').trim(),
    countryOfOrigin: String(mapped.countryOfOrigin || '').trim(),
    leadTime,
    deliveryTime: parseNumber(mapped.deliveryTime) ?? leadTime,
    stockQuantity: parseNumber(mapped.stockQuantity) ?? 0,
    images: splitList(mapped.images),
    videos: splitList(mapped.videos).map((url) => ({ url })),
    tags: splitList(mapped.tags),
    paymentTerms: String(mapped.paymentTerms || 'negotiable').trim().toLowerCase(),
    orderType: String(mapped.orderType || 'inquiry_only').trim().toLowerCase(),
    visibility: String(mapped.visibility || 'public').trim().toLowerCase(),
    sampleAvailable: parseBoolean(mapped.sampleAvailable),
    samplePrice: parseNumber(mapped.samplePrice),
    shipping: {
      available: parseBoolean(mapped.shippingAvailable),
      originPort: String(mapped.originPort || '').trim(),
      methods: splitList(mapped.shippingMethods),
      countries: splitList(mapped.shippingCountries),
      estimateText: String(mapped.shippingEstimate || '').trim(),
    },
    warranty: String(mapped.warranty || '').trim(),
    warrantyPeriod: String(mapped.warrantyPeriod || '').trim(),
    seo: {
      title: String(mapped.seoTitle || '').trim(),
      description: String(mapped.seoDescription || '').trim(),
      keywords: splitList(mapped.seoKeywords),
    },
  };
}

export async function parseBulkProductFile(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = String(file.name || '').split('.').pop()?.toLowerCase();
  let rows;
  let firstDataRow = 2;

  if (extension === 'json') {
    const parsed = JSON.parse(buffer.toString('utf8'));
    rows = Array.isArray(parsed) ? parsed : parsed?.products;
    if (!Array.isArray(rows)) throw new Error('JSON must be an array or an object containing a products array');
    firstDataRow = 1;
  } else {
    const workbook = extension === 'csv'
      ? XLSX.read(buffer.toString('utf8'), { type: 'string', raw: false })
      : XLSX.read(buffer, { type: 'buffer', raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }

  return rows.map((row, index) => ({
    rowNumber: index + firstDataRow,
    raw: row,
    data: normalizeRow(row),
  }));
}

export function buildCategoryLookup(categories, subcategories) {
  const categoryByKey = new Map();
  const subcategoryByCategoryAndKey = new Map();
  for (const category of categories) {
    [category.name, category.slug, String(category._id)].filter(Boolean)
      .forEach((key) => categoryByKey.set(normalizeMatch(key), category));
  }
  for (const subcategory of subcategories) {
    const categoryId = String(subcategory.categoryId);
    [subcategory.name, subcategory.slug, String(subcategory._id)].filter(Boolean)
      .forEach((key) => subcategoryByCategoryAndKey.set(
        `${categoryId}:${normalizeMatch(key)}`,
        subcategory
      ));
  }
  return { categoryByKey, subcategoryByCategoryAndKey };
}

export function validateBulkRows(parsedRows, lookup) {
  const seenKeys = new Set();
  return parsedRows.map((row) => {
    const errors = [];
    const warnings = [];
    const data = { ...row.data };
    const duplicateKey = normalizeMatch(`${data.name}-${data.category}-${data.subcategory}`);

    if (!data.name || data.name.length < 2) errors.push('Product Name is required');
    if (!data.description) warnings.push('Description is empty');
    if (data.price === null || data.price < 0) errors.push('Price must be a valid non-negative number');
    if (!data.minimumOrderQuantity || data.minimumOrderQuantity < 1) errors.push('MOQ must be at least 1');
    if (!['prepayment', 'partial_prepayment', 'bank_transfer', 'credit', 'negotiable'].includes(data.paymentTerms)) errors.push(`Invalid Payment Terms: ${data.paymentTerms}`);
    if (!['inquiry_only', 'rfq_only', 'direct_order_enabled'].includes(data.orderType)) errors.push(`Invalid Order Type: ${data.orderType}`);
    if (!['public', 'private', 'unlisted'].includes(data.visibility)) errors.push(`Invalid Visibility: ${data.visibility}`);
    if (data.seo.title.length > 160) errors.push('SEO Title cannot exceed 160 characters');
    if (data.seo.description.length > 180) errors.push('SEO Description cannot exceed 180 characters');

    const category = lookup.categoryByKey.get(normalizeMatch(data.category));
    if (!category) {
      errors.push(`Invalid category: ${data.category || 'blank'}`);
    } else {
      data.categoryId = String(category._id);
      data.category = category.name;
      const subcategory = lookup.subcategoryByCategoryAndKey.get(
        `${String(category._id)}:${normalizeMatch(data.subcategory)}`
      );
      if (!subcategory) errors.push(`Invalid subcategory for ${category.name}: ${data.subcategory || 'blank'}`);
      else {
        data.subcategoryId = String(subcategory._id);
        data.subcategory = subcategory.name;
      }
    }

    for (const imageUrl of data.images) {
      try {
        const url = new URL(imageUrl);
        if (!['http:', 'https:'].includes(url.protocol)) errors.push(`Invalid image URL: ${imageUrl}`);
      } catch {
        errors.push(`Invalid image URL: ${imageUrl}`);
      }
    }

    if (duplicateKey && seenKeys.has(duplicateKey)) warnings.push('Duplicate product row in this upload');
    seenKeys.add(duplicateKey);
    return { rowNumber: row.rowNumber, raw: row.raw, data, errors, warnings, status: errors.length ? 'invalid' : 'valid' };
  });
}

export function summarizeRows(rows) {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'valid').length,
    invalidRows: rows.filter((row) => row.status === 'invalid').length,
    importedRows: rows.filter((row) => row.status === 'imported').length,
    failedRows: rows.filter((row) => row.status === 'failed').length,
    warningRows: rows.filter((row) => row.warnings?.length).length,
  };
}
