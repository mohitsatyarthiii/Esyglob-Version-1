export const MARKETPLACE_CATEGORIES = [
  { name: 'Agriculture', subcategories: ['Seeds', 'Fertilizers', 'Pesticides', 'Farm Machinery', 'Irrigation'] },
  { name: 'Apparel & Fashion', subcategories: ["Men's Wear", "Women's Wear", "Kids' Wear", 'Footwear', 'Accessories'] },
  { name: 'Automobile', subcategories: ['Car Accessories', 'Spare Parts', 'Tyres & Tubes', 'Oils & Lubricants', 'Car Care'] },
  { name: 'Brass Hardware & Components', subcategories: ['Brass Fittings', 'Brass Valves', 'Brass Fasteners', 'Brass Inserts', 'Brass Bush'] },
  { name: 'Chemicals', subcategories: ['Industrial Chemicals', 'Specialty Chemicals', 'Basic Chemicals', 'Inorganic Chemicals', 'Organic Chemicals'] },
  { name: 'Computer Hardware & Software', subcategories: ['Desktops', 'Laptops', 'Components', 'Peripherals', 'Networking'] },
  { name: 'Construction & Real Estate', subcategories: ['Building Materials', 'Cement & Concrete', 'Steel & Metals', 'Paints & Coatings', 'Electricals'] },
  { name: 'Consumer Electronics', subcategories: ['Televisions', 'Audio Systems', 'Home Appliances', 'Mobile Phones', 'Wearables'] },
  { name: 'Electronics & Electrical Supplies', subcategories: ['Cables & Wires', 'Switches & Sockets', 'Circuit Protection', 'Lighting', 'Fans & Ventilation'] },
  { name: 'Energy & Power', subcategories: ['Solar Power', 'Generators', 'Batteries', 'Inverters', 'Transformers'] },
  { name: 'Environment & Pollution', subcategories: ['Waste Management', 'Water Treatment', 'Air Pollution Control', 'Recycling Solutions', 'Eco Products'] },
  { name: 'Food & Beverage', subcategories: ['Snacks & Namkeen', 'Beverages', 'Dairy Products', 'Bakery Products', 'Frozen Foods'] },
  { name: 'Furniture', subcategories: ['Living Room', 'Bedroom', 'Dining Room', 'Office Furniture', 'Outdoor Furniture'] },
  { name: 'Gifts & Crafts', subcategories: ['Gift Items', 'Handicrafts', 'Home Decor', 'Personalized Gifts', 'Stationery'] },
  { name: 'Health & Beauty', subcategories: ['Skin Care', 'Hair Care', 'Personal Care', 'Cosmetics', 'Fragrances'] },
  { name: 'Home Supplies', subcategories: ['Cleaning Supplies', 'Kitchenware', 'Home Utilities', 'Storage & Organization', 'Home Appliances'] },
  { name: 'Home Textiles & Furnishings', subcategories: ['Curtains', 'Bedsheets', 'Cushion Covers', 'Towels', 'Blankets'] },
  { name: 'Hospital & Medical Supplies', subcategories: ['Diagnostic Equipment', 'Surgical Instruments', 'Disposable Supplies', 'Patient Care', 'Medical Consumables'] },
  { name: 'Hotel Supplies & Equipment', subcategories: ['Hotel Furniture', 'Kitchen Equipment', 'Tableware', 'Linens', 'Housekeeping Supplies'] },
  { name: 'Industrial Supplies', subcategories: ['Bearings', 'Fasteners', 'Industrial Tools', 'Material Handling', 'Safety Supplies'] },
  { name: 'Jewelry & Gemstones', subcategories: ['Gold Jewelry', 'Silver Jewelry', 'Gemstones', 'Beads & Pearls', 'Fashion Jewelry'] },
  { name: 'Leather & Leather Products', subcategories: ['Leather Bags', 'Wallets', 'Belts', 'Shoes', 'Leather Accessories'] },
  { name: 'Machinery', subcategories: ['Industrial Machinery', 'Construction Machinery', 'Packaging Machinery', 'Printing Machinery', 'Textile Machinery'] },
  { name: 'Mineral & Metals', subcategories: ['Iron & Steel', 'Aluminum', 'Copper', 'Precious Metals', 'Metal Scrap'] },
  { name: 'Office & School Supplies', subcategories: ['Stationery', 'Office Paper', 'Writing Instruments', 'Files & Folders', 'Desk Accessories'] },
  { name: 'Packaging & Laboratory Instruments', subcategories: ['Packaging Materials', 'Laboratory Instruments', 'Glassware', 'Test Kits', 'Safety Equipment'] },
  { name: 'Perfumery', subcategories: ['Perfumes', 'Essential Oils', 'Fragrances', 'Deodorants', 'Aromatic Products'] },
  { name: 'Pipes, Tubes & Fittings', subcategories: ['Plastic Sheets', 'Plastic Containers', 'Plastic Pipes', 'Plastic Films', 'Plastic Components'] },
  { name: 'Plastics & Products', subcategories: ['Printing Machines', 'Paper Products', 'Ink & Toners', 'Books & Magazines', 'Packaging Printing'] },
  { name: 'Scientific & Laboratory Instruments', subcategories: ['Microscopes', 'Lab Glassware', 'Testing Instruments', 'Measurement Tools', 'Lab Consumables'] },
  { name: 'Sports & Entertainment', subcategories: ['Sportswear', 'Outdoor Wear', 'Footwear', 'Bags & Backpacks', 'Caps & Accessories'] },
  { name: 'Sportswear & Outdoor Apparel', subcategories: ['Mobile Phones', 'Network Equipment', 'Cables & Accessories', 'Communication Devices', 'Signal Boosters'] },
  { name: 'Telecommunications', subcategories: ['Mobile Phones', 'Network Equipment', 'Cable Accessories', 'Communication Devices', 'Signal Boosters'] },
  { name: 'Toys', subcategories: ['Soft Toys', 'Educational Toys', 'Action Figures', 'Puzzles', 'Baby Toys'] },
  { name: 'Transportation', subcategories: ['Trucks', 'Buses', 'Spare Parts', 'Vehicle Accessories', 'Logistics Services'] },
].map((category) => ({
  ...category,
  slug: slugifyCategory(category.name),
  description: `Source ${category.name.toLowerCase()} products from verified B2B suppliers and manufacturers.`,
  trending: category.subcategories.slice(0, 3),
}));

export function getCategoryBySlug(slug) {
  return MARKETPLACE_CATEGORIES.find((category) => category.slug === slug);
}

export function slugifyCategory(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function categoryImageSeed(slug) {
  return `/globe.svg?category=${encodeURIComponent(slug)}`;
}
