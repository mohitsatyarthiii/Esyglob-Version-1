// scripts/updateMadhurSeller.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

// ============================================
// WORKING IMAGES (Cloudinary se - expire nahi hongi)
// ============================================
const IMAGES = {
  // Beverage factory images (Pexels - permanent URLs)
  factory1: "https://images.pexels.com/photos/3735178/pexels-photo-3735178.jpeg?w=800&h=600&fit=crop",
  factory2: "https://images.pexels.com/photos/3735185/pexels-photo-3735185.jpeg?w=800&h=600&fit=crop",
  factory3: "https://images.pexels.com/photos/3735186/pexels-photo-3735186.jpeg?w=800&h=600&fit=crop",
  factory4: "https://images.pexels.com/photos/3735187/pexels-photo-3735187.jpeg?w=800&h=600&fit=crop",
  
  // Bottling line
  bottling1: "https://images.pexels.com/photos/12935074/pexels-photo-12935074.jpeg?w=600&h=400&fit=crop",
  bottling2: "https://images.pexels.com/photos/12935075/pexels-photo-12935075.jpeg?w=600&h=400&fit=crop",
  
  // Banner
  banner: "https://images.pexels.com/photos/12935076/pexels-photo-12935076.jpeg?w=1200&h=400&fit=crop",
};

const MADHUR_UPDATE = {
  filter: {
    _id: new mongoose.Types.ObjectId("6a31d5444b7a334d2c188f18"),
    userId: new mongoose.Types.ObjectId("6a31d544fd0476a85f7b7e50")
  },
  
  // ==========================================
  // SELLER PROFILE UPDATE
  // ==========================================
  sellerUpdate: {
    companyName: "Madhur Beverages Pvt Ltd",
    companyType: "manufacturer",
    companyDescription: "Madhur Beverages is a leading FMCG beverage manufacturer based in Mumbai, Maharashtra. With over a decade of excellence, we produce carbonated soft drinks, fruit juices, energy drinks, and packaged drinking water. Our state-of-the-art 60,000 sq ft facility features fully automated bottling lines from Krones Germany and Sidel France. We serve 5000+ retailers, 200+ distributors, and export to 15 countries with a commitment to quality and innovation.",
    
    businessEmail: "madhur@gmail.com",
    businessPhone: "+91-9876543210",
    website: "https://www.madhurbeverages.com",
    
    address: {
      street: "Plot No. 89, Beverage Park, MIDC, Andheri East",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      pincode: "400001",
      landmark: "Near MIDC Industrial Area, Andheri East"
    },
    
    // Cloudinary se working images
    profileImage: "https://images.pexels.com/photos/3735178/pexels-photo-3735178.jpeg?w=400&h=400&fit=crop",
    companyLogo: "https://images.pexels.com/photos/3735185/pexels-photo-3735185.jpeg?w=200&h=200&fit=crop",
    bannerImage: IMAGES.banner,
    
    factoryImages: [
      IMAGES.factory1,
      IMAGES.factory2,
      IMAGES.factory3,
      IMAGES.factory4
    ],
    
    verificationLevel: 3,
    isTrustedSeller: true,
    trustedSellerBadge: "active",
    factoryProfileCompleted: true,
    factoryVerified: true,
    
    trustScore: 92,
    
    productCategories: [
      "Food & Beverage",
      "Health & Beauty",
      "Hotel Supplies & Equipment"
    ],
    
    certifications: [
      {
        name: "ISO 22000:2018 (Food Safety)",
        issuer: "TUV India",
        certificateNumber: "ISO22000-2024-MADHUR-12345",
        validUntil: new Date("2027-12-31")
      },
      {
        name: "FSSAI Licensed",
        issuer: "Food Safety and Standards Authority of India",
        certificateNumber: "FSSAI-MH-2024-67890",
        validUntil: new Date("2028-06-30")
      },
      {
        name: "HACCP Certified",
        issuer: "BSI Group India",
        certificateNumber: "HACCP-2024-MADHUR-45678",
        validUntil: new Date("2027-03-31")
      },
      {
        name: "GMP Certified",
        issuer: "WHO-GMP India",
        certificateNumber: "GMP-2024-MADHUR-89012",
        validUntil: new Date("2026-12-31")
      }
    ],
    
    manufacturingDetails: {
      processType: "Automated Beverage Manufacturing & Bottling",
      capacity: "500,000 liters/day",
      automationLevel: "Fully Automated - Krones & Sidel Lines",
      factorySize: "60,000 sq ft",
      employees: 250,
      establishedYear: 2012,
      minimumOrderQuantity: "1000 units per SKU",
      sampleAvailable: true,
      customPackaging: true,
      qualityControlProcess: "In-house NABL accredited lab. HPLC, GC-MS, and microbiological testing. 24-point quality check from raw material to finished product. Online monitoring with SCADA systems.",
      
      productionLines: [
        "PET Bottle Line (200ml to 2L) - 30,000 BPH",
        "Glass Bottle Line (200ml to 750ml) - 20,000 BPH",
        "Can Line (250ml to 500ml) - 40,000 CPH",
        "Tetra Pak Line (200ml to 1L)",
        "Pouch Packing Line (200ml to 500ml)",
        "Jar & Container Line (500ml to 5L)"
      ],
      
      keyEquipment: [
        "Krones Contiform 3 Blow Molder",
        "Krones Modulfill VFS Filler (Hygienic)",
        "Sidel Combi SF300 Filler-Capper",
        "KHS Innopack Kisters Shrink Wrapper",
        "Videojet 1860 Continuous Inkjet Printer",
        "Anton Paar CO2 & Brix Monitor",
        "Sartorius Microbial Air Sampler",
        "Millipore Water Purification System (RO + UV + UF)"
      ],
      
      qualityStandards: [
        "FSSAI Compliance",
        "HACCP Level 3",
        "ISO 22000:2018",
        "BIS Standards (IS 14543 for Packaged Water)",
        "NABL Lab Accreditation"
      ]
    },
    
    productSpecializations: [
      "Carbonated Soft Drinks (Cola, Orange, Lemon, Mango)",
      "Fruit Juice & Nectars (Mango, Apple, Orange, Mixed)",
      "Energy Drinks (Caffeinated, Non-Caffeinated)",
      "Packaged Drinking Water (500ml to 20L)",
      "Flavored Sparkling Water",
      "Sports & Isotonic Drinks",
      "Soda & Tonic Water",
      "Syrups & Concentrates (B2B)"
    ],
    
    shippingInfo: {
      exportCountries: [
        "UAE", "Saudi Arabia", "Qatar", "Oman", "Kuwait",
        "Bangladesh", "Sri Lanka", "Nepal", "Myanmar",
        "Kenya", "Nigeria", "Ghana", "South Africa",
        "Malaysia", "Singapore", "Maldives"
      ],
      preferredCarriers: ["Maersk", "MSC", "CMA CGM", "DPI (Dubai)"],
      shippingMethods: ["FCL (20ft/40ft)", "LCL", "Reefer Containers", "Air Freight (Urgent)"],
      packagingType: "Export-grade shrink-wrapped trays. Palletized loading. Custom labeling available. Shelf-life: 12-18 months.",
      averageShippingTime: "10-15 days (Sea), 3-5 days (Air)",
      portOfLoading: "Nhava Sheva (Mumbai), Mundra (Gujarat)"
    },
    
    exportMarkets: [
      "UAE", "Saudi Arabia", "Qatar", "Oman", "Kuwait",
      "Bangladesh", "Sri Lanka", "Nepal", "Myanmar",
      "Kenya", "Nigeria", "Ghana", "South Africa",
      "Malaysia", "Singapore", "Maldives"
    ],
    
    tradeTerms: ["FOB", "CIF", "EXW"],
    paymentTerms: ["LC at Sight", "TT 30/70", "Advance Payment"],
    
    businessHours: {
      monday: "9:00 AM - 7:00 PM",
      tuesday: "9:00 AM - 7:00 PM",
      wednesday: "9:00 AM - 7:00 PM",
      thursday: "9:00 AM - 7:00 PM",
      friday: "9:00 AM - 7:00 PM",
      saturday: "9:00 AM - 5:00 PM",
      sunday: "Closed"
    },
    
    subscriptionPlan: "seller_gold",
    subscriptionStatus: "active",
    
    yearEstablished: 2012,
    languages: ["English", "Hindi", "Marathi"],
    
    socialLinks: {
      linkedin: "https://linkedin.com/company/madhur-beverages",
      facebook: "https://facebook.com/madhurbeverages",
      instagram: "https://instagram.com/madhurbeverages",
      youtube: "https://youtube.com/@madhurbeverages"
    },
    
    tags: [
      "beverage manufacturer", "soft drinks", "fruit juice",
      "energy drinks", "packaged water", "FMCG manufacturer",
      "beverage exporter India", "carbonated drinks", "OEM beverages",
      "private label beverages", "bulk beverage supplier"
    ],
    
    responseGuarantee: "Responds within 2 hours",
    
    qualityPromise: "ISO 22000 & HACCP certified. NABL accredited lab. 24-point quality check. 100% batch testing. FSSAI licensed.",
    
    updatedAt: new Date()
  },
  
  // ==========================================
  // FACTORY PROFILE UPDATE (Separate Collection)
  // ==========================================
  factoryUpdate: {
    name: "Madhur Beverages - Main Manufacturing Plant",
    address: {
      street: "Plot No. 89, Beverage Park, MIDC, Andheri East",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      pincode: "400001",
      coordinates: {
        latitude: 19.1136,
        longitude: 72.8697
      }
    },
    floorArea: "60,000 sq ft",
    description: "State-of-the-art beverage manufacturing facility with 6 automated production lines from Krones (Germany) and Sidel (France). Total capacity: 500,000 liters per day. Features include: RO + UV + UF water treatment plant, automated syrup room, in-house NABL accredited quality lab, temperature-controlled warehouse, and ETP (Effluent Treatment Plant).",
    employeeCount: 250,
    productionLines: 6,
    machinery: [
      { name: "Krones Contiform 3 Blow Molder", quantity: 2, model: "Contiform 3 Pro", year: 2022 },
      { name: "Krones Modulfill VFS Filler", quantity: 2, model: "Modulfill VFS 200", year: 2022 },
      { name: "Sidel Combi Filler-Capper", quantity: 1, model: "SF300 FM", year: 2021 },
      { name: "KHS Innopack Shrink Wrapper", quantity: 3, model: "Kisters TSP 060", year: 2022 },
      { name: "Videojet Inkjet Printer", quantity: 4, model: "1860 CIJ", year: 2023 },
      { name: "Anton Paar CO2 Analyzer", quantity: 2, model: "CarboQC ME", year: 2023 },
      { name: "Millipore Water System", quantity: 1, model: "Elix 100 + RiOs 200", year: 2021 },
      { name: "Sartorius Air Sampler", quantity: 2, model: "MD8 Airscan", year: 2022 }
    ],
    monthlyCapacity: "15 million liters",
    annualCapacity: "180 million liters",
    capabilities: [
      "PET Bottle Manufacturing & Filling",
      "Glass Bottle Filling",
      "Can Filling (Aluminum)",
      "Tetra Pak Aseptic Filling",
      "Pouch Packing",
      "Hot Fill & Cold Fill",
      "Carbonated & Non-Carbonated",
      "Custom Labeling & Private Label",
      "Export-Grade Packaging"
    ],
    qualityControl: "NABL Accredited In-house Lab. HPLC, GC-MS, Spectrophotometer, Microbiological Testing. 24-point quality check: Raw water testing, Sugar/Brix monitoring, CO2 volume check, pH & acidity, microbial analysis, torque testing, seal integrity, drop test, shelf-life study. Online SCADA monitoring with real-time alerts.",
    
    // Working images (Pexels - permanent)
    images: [
      "https://images.pexels.com/photos/3735178/pexels-photo-3735178.jpeg?w=800&h=600&fit=crop",
      "https://images.pexels.com/photos/3735185/pexels-photo-3735185.jpeg?w=800&h=600&fit=crop",
      "https://images.pexels.com/photos/3735186/pexels-photo-3735186.jpeg?w=800&h=600&fit=crop",
      "https://images.pexels.com/photos/3735187/pexels-photo-3735187.jpeg?w=800&h=600&fit=crop",
      "https://images.pexels.com/photos/12935074/pexels-photo-12935074.jpeg?w=800&h=600&fit=crop"
    ],
    
    videos: [],
    
    verificationStatus: "verified",
    inspectedAt: new Date("2024-03-15"),
    inspectedBy: null
  }
};

// ============================================
// MAIN FUNCTION
// ============================================
async function updateMadhurSeller() {
  console.log(`\n${c.cyan}========================================${c.reset}`);
  console.log(`${c.yellow}🔄 UPDATING: Madhur Beverages (Seller + Factory)${c.reset}`);
  console.log(`${c.cyan}========================================\n${c.reset}`);
  
  try {
    console.log(`${c.blue}🔌 Connecting to MongoDB...${c.reset}`);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`${c.green}✅ Connected\n${c.reset}`);
    
    const db = mongoose.connection.db;
    
    // ==========================================
    // 1. UPDATE SELLER PROFILE
    // ==========================================
    console.log(`${c.yellow}📝 [1/3] Updating Seller Profile...${c.reset}`);
    
    const sellerBefore = await db.collection('sellers').findOne(MADHUR_UPDATE.filter);
    console.log(`   Before: Images=${sellerBefore?.factoryImages?.length || 0}, Certifications=${sellerBefore?.certifications?.length || 0}`);
    
    const sellerResult = await db.collection('sellers').updateOne(
      MADHUR_UPDATE.filter,
      { $set: MADHUR_UPDATE.sellerUpdate }
    );
    
    if (sellerResult.matchedCount === 0) {
      console.log(`${c.red}❌ Seller not found!${c.reset}`);
      process.exit(1);
    }
    
    console.log(`${c.green}✅ Seller profile updated${c.reset}`);
    
    // ==========================================
    // 2. UPDATE FACTORY PROFILE
    // ==========================================
    console.log(`\n${c.yellow}🏭 [2/3] Updating Factory Profile...${c.reset}`);
    
    const factoryBefore = await db.collection('factoryprofiles').findOne({
      sellerId: MADHUR_UPDATE.filter._id
    });
    
    if (factoryBefore) {
      // Update existing
      await db.collection('factoryprofiles').updateOne(
        { sellerId: MADHUR_UPDATE.filter._id },
        { $set: MADHUR_UPDATE.factoryUpdate }
      );
      console.log(`${c.green}✅ Factory profile updated${c.reset}`);
    } else {
      // Create new
      await db.collection('factoryprofiles').insertOne({
        sellerId: MADHUR_UPDATE.filter._id,
        ...MADHUR_UPDATE.factoryUpdate,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log(`${c.green}✅ Factory profile created${c.reset}`);
    }
    
    // ==========================================
    // 3. UPDATE USER
    // ==========================================
    console.log(`\n${c.yellow}👤 [3/3] Updating User Account...${c.reset}`);
    
    await db.collection('users').updateOne(
      { _id: MADHUR_UPDATE.filter.userId },
      { $set: { isEmailVerified: true, isPhoneVerified: true, updatedAt: new Date() } }
    );
    
    console.log(`${c.green}✅ User verified${c.reset}`);
    
    // ==========================================
    // VERIFICATION
    // ==========================================
    console.log(`\n${c.cyan}========================================${c.reset}`);
    console.log(`${c.cyan}🔍 VERIFICATION${c.reset}`);
    console.log(`${c.cyan}========================================\n${c.reset}`);
    
    const seller = await db.collection('sellers').findOne(MADHUR_UPDATE.filter);
    const factory = await db.collection('factoryprofiles').findOne({
      sellerId: MADHUR_UPDATE.filter._id
    });
    
    console.log(`${c.yellow}📦 SELLER PROFILE:${c.reset}`);
    console.log(`   Name: ${seller?.companyName}`);
    console.log(`   Verification: Level ${seller?.verificationLevel} ✅`);
    console.log(`   Trust Score: ${seller?.trustScore} ✅`);
    console.log(`   Certifications: ${seller?.certifications?.length || 0} ✅`);
    console.log(`   Factory Images: ${seller?.factoryImages?.length || 0} ✅`);
    console.log(`   Categories: ${seller?.productCategories?.length || 0} ✅`);
    console.log(`   Export Markets: ${seller?.exportMarkets?.length || 0} ✅`);
    console.log(`   Subscription: ${seller?.subscriptionPlan} (${seller?.subscriptionStatus}) ✅`);
    console.log(`   Products: ${seller?.totalProducts || 0} ${c.cyan}(UNCHANGED)${c.reset}`);
    
    console.log(`\n${c.yellow}🏭 FACTORY PROFILE:${c.reset}`);
    console.log(`   Name: ${factory?.name}`);
    console.log(`   Status: ${factory?.verificationStatus} ✅`);
    console.log(`   Images: ${factory?.images?.length || 0} ✅`);
    console.log(`   Machinery: ${factory?.machinery?.length || 0} ✅`);
    console.log(`   Production Lines: ${factory?.productionLines} ✅`);
    console.log(`   Employees: ${factory?.employeeCount} ✅`);
    console.log(`   Floor Area: ${factory?.floorArea} ✅`);
    console.log(`   Monthly Capacity: ${factory?.monthlyCapacity} ✅`);
    
    console.log(`\n${c.cyan}========================================${c.reset}`);
    console.log(`${c.green}✅ MADHUR BEVERAGES - SELLER + FACTORY UPDATE COMPLETE!${c.reset}`);
    console.log(`${c.cyan}========================================\n${c.reset}`);
    
  } catch (error) {
    console.error(`\n${c.red}❌ Error:${c.reset}`, error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log(`${c.blue}🔌 Connection closed${c.reset}\n`);
  }
}

updateMadhurSeller();