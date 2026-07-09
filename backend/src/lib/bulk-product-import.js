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
  'Specifications',
  'Brand',
  'Country Of Origin',
  'Lead Time',
  'Stock Quantity',
  'Product Images',
  'Product Videos',
  'Tags',
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
  specifications: ['specifications', 'specs'],
  brand: ['brand'],
  countryOfOrigin: ['country of origin', 'origin country', 'countryoforigin'],
  leadTime: ['lead time', 'leadtime'],
  stockQuantity: ['stock quantity', 'stock', 'inventory'],
  images: ['product images', 'images', 'image urls'],
  videos: ['product videos', 'videos', 'video urls'],
  tags: ['tags', 'keywords'],
};

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeMatch(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function splitList(value) {
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

function parseSpecifications(value) {
  const text = String(value || '').trim();
  if (!text) return {};

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      // Fall through to pipe/colon parsing
    }
  }

  return text.split(/[|;]/).reduce((specs, item) => {
    const [key, ...rest] = item.split(/[:=]/);
    if (key?.trim() && rest.length) specs[key.trim()] = rest.join(':').trim();
    return specs;
  }, {});
}

function normalizeRow(row) {
  const mapped = {};
  const entries = Object.entries(row || {}).map(([key, value]) => [normalizeKey(key), value]);

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const match = entries.find(([key]) => aliases.includes(key));
    mapped[field] = match?.[1] ?? '';
  }

  const leadTimeNumber = parseNumber(mapped.leadTime);
  return {
    name: String(mapped.name || '').trim(),
    description: String(mapped.description || '').trim(),
    category: String(mapped.category || '').trim(),
    subcategory: String(mapped.subcategory || '').trim(),
    minimumOrderQuantity: parseNumber(mapped.minimumOrderQuantity),
    unit: String(mapped.unit || 'piece').trim() || 'piece',
    price: parseNumber(mapped.price),
    currency: String(mapped.currency || 'INR').trim().toUpperCase() || 'INR',
    specifications: parseSpecifications(mapped.specifications),
    brand: String(mapped.brand || '').trim(),
    countryOfOrigin: String(mapped.countryOfOrigin || '').trim(),
    leadTime: leadTimeNumber ?? 0,
    stockQuantity: parseNumber(mapped.stockQuantity) ?? 0,
    images: splitList(mapped.images),
    videos: splitList(mapped.videos).map((url) => ({ url })),
    tags: splitList(mapped.tags),
  };
}

export async function parseBulkProductFile(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || '';
  const extension = fileName.split('.').pop()?.toLowerCase();
  const workbook =
    extension === 'csv'
      ? XLSX.read(buffer.toString('utf8'), { type: 'string', raw: false })
      : XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  return rows.map((row, index) => ({
    rowNumber: index + 2,
    raw: row,
    data: normalizeRow(row),
  }));
}

export function buildCategoryLookup(categories, subcategories) {
  const categoryByKey = new Map();
  const subcategoryByCategoryAndKey = new Map();

  for (const category of categories) {
    [category.name, category.slug, String(category._id)]
      .filter(Boolean)
      .forEach((key) => {
        categoryByKey.set(normalizeMatch(key), category);
      });
  }

  for (const subcategory of subcategories) {
    const categoryId = String(subcategory.categoryId);
    [subcategory.name, subcategory.slug, String(subcategory._id)]
      .filter(Boolean)
      .forEach((key) => {
        subcategoryByCategoryAndKey.set(
          `${categoryId}:${normalizeMatch(key)}`,
          subcategory
        );
      });
  }

  return { categoryByKey, subcategoryByCategoryAndKey };
}

export function validateBulkRows(parsedRows, lookup) {
  const duplicateKeys = new Set();
  const seenKeys = new Map();

  for (const row of parsedRows) {
    const key = normalizeMatch(
      `${row.data.name}-${row.data.category}-${row.data.subcategory}`
    );
    if (!key) continue;
    if (seenKeys.has(key)) {
      duplicateKeys.add(key);
      duplicateKeys.add(seenKeys.get(key));
    } else {
      seenKeys.set(key, key);
    }
  }

  return parsedRows.map((row) => {
    const errors = [];
    const warnings = [];
    const data = { ...row.data };

    if (!data.name || data.name.length < 2) errors.push('Product Name is required');
    if (!data.description) warnings.push('Description is empty');
    if (data.price === null || data.price < 0)
      errors.push('Price must be a valid non-negative number');
    if (!data.minimumOrderQuantity || data.minimumOrderQuantity < 1)
      errors.push('MOQ must be at least 1');

    const category = lookup.categoryByKey.get(normalizeMatch(data.category));
    if (!category) {
      errors.push(`Invalid category: ${data.category || 'blank'}`);
    } else {
      data.categoryId = String(category._id);
      data.category = category.name;
      const subcategory = lookup.subcategoryByCategoryAndKey.get(
        `${String(category._id)}:${normalizeMatch(data.subcategory)}`
      );
      if (!subcategory) {
        errors.push(
          `Invalid subcategory for ${category.name}: ${data.subcategory || 'blank'}`
        );
      } else {
        data.subcategoryId = String(subcategory._id);
        data.subcategory = subcategory.name;
      }
    }

    for (const imageUrl of data.images) {
      try {
        const url = new URL(imageUrl);
        if (!['http:', 'https:'].includes(url.protocol))
          errors.push(`Invalid image URL: ${imageUrl}`);
      } catch {
        errors.push(`Invalid image URL: ${imageUrl}`);
      }
    }

    const duplicateKey = normalizeMatch(
      `${row.data.name}-${row.data.category}-${row.data.subcategory}`
    );
    if (duplicateKeys.has(duplicateKey))
      warnings.push('Duplicate product row in this upload');

    return {
      rowNumber: row.rowNumber,
      raw: row.raw,
      data,
      errors,
      warnings,
      status: errors.length ? 'invalid' : 'valid',
    };
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