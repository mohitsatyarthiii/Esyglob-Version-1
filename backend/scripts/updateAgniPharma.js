// scripts/updateIBElectronics.js
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

const IBE_UPDATE = {
  filter: {
    _id: new mongoose.Types.ObjectId("6a383596e35fdc2be4b78667"),
    userId: new mongoose.Types.ObjectId("6a383594db5a69ebb8df1990")
  },
  
  updateData: {
    companyName: "IB ELECTRONICS",
    companyType: "manufacturer",
    companyDescription: "IB ELECTRONICS is a trusted electronics manufacturer based in Mumbai, Maharashtra. We specialize in PCB assembly, electronic components, and consumer electronics manufacturing. Our ISO-certified facility is equipped with SMT lines, through-hole assembly, and complete testing infrastructure. We serve OEMs, industrial clients, and consumer brands across India and export markets with precision manufacturing and strict quality control.",

    website: "https://www.ibelectronics.in",
    
    address: {
      street: "Unit 12, Electronic Zone, Main Road, SEEPZ",
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
      pincode: "400001",
      landmark: "SEEPZ Special Economic Zone, Andheri East"
    },
    
    gstNumber: "27IBELE7890N1Z5",
    panNumber: "IBELE7890N",
    
    profileImage: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&h=400&fit=crop",
    companyLogo: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=200&h=200&fit=crop",
    bannerImage: "https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=1200&h=400&fit=crop",
    
    factoryImages: [
      "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1565434345907-b0c6e5b9e8a9?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&h=600&fit=crop"
    ],
    
    // PCB & Electronics specific images
    manufacturingImages: [
      "https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=400&fit=crop"
    ],
    
    verificationLevel: 3,
    isTrustedSeller: true,
    trustedSellerBadge: "active",
    
    trustScore: 88,
    
    productCategories: [
      "Consumer Electronics",
      "Electronics & Electrical Supplies",
      "Industrial Supplies",
      "Telecommunications",
      "Computer Hardware & Software"
    ],
    
    certifications: [
      {
        name: "ISO 9001:2015",
        issuer: "TUV India",
        certificateNumber: "ISO-2024-IBE-78901",
        validUntil: new Date("2027-12-31")
      },
      {
        name: "ISO 14001:2015 (Environmental)",
        issuer: "BSI Group India",
        certificateNumber: "ISO-14001-2024-IBE-23456",
        validUntil: new Date("2027-06-30")
      },
      {
        name: "RoHS Compliant",
        issuer: "TUV SUD",
        certificateNumber: "ROHS-2024-IBE-56789",
        validUntil: new Date("2026-12-31")
      },
      {
        name: "IPC-A-610 Certified (PCB Assembly)",
        issuer: "IPC International",
        certificateNumber: "IPC-610-2024-IBE-89012",
        validUntil: new Date("2027-09-30")
      }
    ],
    
    manufacturingDetails: {
      processType: "PCB Assembly, Electronic Manufacturing Services (EMS)",
      capacity: "100,000 PCBs/month",
      automationLevel: "High - SMT Lines, Automated Testing",
      factorySize: "35,000 sq ft",
      employees: 85,
      establishedYear: 2016,
      minimumOrderQuantity: "100 units per design",
      sampleAvailable: true,
      customPackaging: true,
      qualityControlProcess: "IPC-A-610 Class 3 standards. AOI (Automated Optical Inspection), X-Ray inspection for BGA, ICT (In-Circuit Testing), Functional Testing, Burn-in testing. ESD-safe production floor.",
      
      productionLines: [
        "SMT Line 1 - High Speed (40,000 CPH)",
        "SMT Line 2 - Flexible (25,000 CPH)",
        "Through-Hole Assembly Line",
        "Mixed Technology Assembly Line",
        "Box Build Assembly Line",
        "Conformal Coating Line"
      ],
      
      keyEquipment: [
        "Yamaha YSM20R SMT Pick & Place",
        "DEK Horizon 03iX Screen Printer",
        "Heller 1913 Reflow Oven (12 Zone)",
        "Koh Young Zenith 3D AOI",
        "Dage XD7600NT X-Ray Inspection",
        "Teradyne TestStation ICT",
        "Thermotron SE-300 Environmental Chamber",
        "Nordson Select Coat SC-280 Conformal Coating"
      ],
      
      capabilities: [
        "SMT Assembly (0201 to BGA/QFN)",
        "Through-Hole & Mixed Technology",
        "Box Build & System Integration",
        "Cable & Wire Harness Assembly",
        "Conformal Coating & Potting",
        "Functional Testing & Programming",
        "BGA Rework & Reballing"
      ]
    },
    
    productSpecializations: [
      "PCB Assembly (SMT & Through-Hole)",
      "Industrial Control Panels",
      "LED Driver Circuits",
      "Power Supply Units (SMPS)",
      "IoT & Smart Device PCBs",
      "Medical Electronics PCB",
      "Automotive Electronics",
      "Telecom Equipment Assembly",
      "Consumer Electronics Assembly"
    ],
    
    shippingInfo: {
      exportCountries: [
        "USA", "UK", "Germany", "UAE", "Singapore",
        "Malaysia", "Thailand", "Australia", "Canada",
        "Netherlands", "South Korea", "Japan"
      ],
      preferredCarriers: ["DHL Express", "FedEx", "UPS", "Blue Dart"],
      shippingMethods: ["Air Freight (Preferred)", "Sea Freight (Bulk)", "Courier (Samples)"],
      packagingType: "ESD-safe packaging. Anti-static bags, bubble wrap, custom foam inserts. Export-grade corrugated boxes.",
      averageShippingTime: "3-7 days (Air), 15-20 days (Sea)",
      portOfLoading: "Mumbai Air Cargo, Nhava Sheva (Mumbai)"
    },
    
    exportMarkets: [
      "USA", "UK", "Germany", "UAE", "Singapore",
      "Malaysia", "Thailand", "Australia", "Canada",
      "Netherlands", "South Korea", "Japan"
    ],
    
    tradeTerms: ["FOB", "CIF", "EXW"],
    paymentTerms: ["LC at Sight", "TT 30/70", "Advance Payment"],
    
    businessHours: {
      monday: "9:00 AM - 7:00 PM",
      tuesday: "9:00 AM - 7:00 PM",
      wednesday: "9:00 AM - 7:00 PM",
      thursday: "9:00 AM - 7:00 PM",
      friday: "9:00 AM - 7:00 PM",
      saturday: "9:00 AM - 3:00 PM",
      sunday: "Closed"
    },
    
    subscriptionPlan: "seller_gold",
    subscriptionStatus: "active",
    
    yearEstablished: 2016,
    languages: ["English", "Hindi", "Marathi"],
    
    socialLinks: {
      linkedin: "https://linkedin.com/company/ib-electronics",
      facebook: "https://facebook.com/ibelectronics",
      instagram: "https://instagram.com/ibelectronics"
    },
    
    tags: [
      "PCB assembly", "electronics manufacturer", "SMT assembly",
      "electronic components", "PCB manufacturer India", "EMS provider",
      "IoT electronics", "industrial electronics", "OEM electronics",
      "contract manufacturing", "box build assembly"
    ],
    
    responseGuarantee: "Responds within 3 hours",
    
    qualityPromise: "IPC-A-610 Class 3 standards. 100% AOI inspection. X-Ray for BGA. Functional testing on every unit. ESD-safe manufacturing.",
    
    updatedAt: new Date()
  }
};

async function updateIBElectronics() {
  console.log(`\n${c.cyan}========================================${c.reset}`);
  console.log(`${c.yellow}🔄 UPDATING: IB ELECTRONICS (Profile Only)${c.reset}`);
  console.log(`${c.cyan}========================================\n${c.reset}`);
  
  try {
    console.log(`${c.blue}🔌 Connecting to MongoDB...${c.reset}`);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`${c.green}✅ Connected\n${c.reset}`);
    
    const db = mongoose.connection.db;
    
    const before = await db.collection('sellers').findOne(IBE_UPDATE.filter);
    console.log(`${c.yellow}📋 BEFORE:${c.reset}`);
    console.log(`   Products: ${before?.totalProducts || 0}`);
    console.log(`   Orders: ${before?.totalOrders || 0}`);
    console.log(`   GST: "${before?.gstNumber || 'EMPTY'}"`);
    console.log(`   Certifications: ${before?.certifications?.length || 0}`);
    console.log(`   Categories: ${before?.productCategories?.length || 0}`);
    console.log(`   Export Markets: ${before?.exportMarkets?.length || 0}`);
    
    const result = await db.collection('sellers').updateOne(
      IBE_UPDATE.filter,
      { $set: IBE_UPDATE.updateData }
    );
    
    if (result.matchedCount === 0) {
      console.log(`${c.red}❌ Seller not found!${c.reset}`);
      process.exit(1);
    }
    
    await db.collection('users').updateOne(
      { _id: IBE_UPDATE.filter.userId },
      { $set: { isEmailVerified: true, isPhoneVerified: true, updatedAt: new Date() } }
    );
    
    const after = await db.collection('sellers').findOne(IBE_UPDATE.filter);
    console.log(`\n${c.green}📋 AFTER:${c.reset}`);
    console.log(`   Products: ${after?.totalProducts || 0} ${c.cyan}(UNCHANGED)${c.reset}`);
    console.log(`   Orders: ${after?.totalOrders || 0} ${c.cyan}(UNCHANGED)${c.reset}`);
    console.log(`   Revenue: ${after?.totalRevenue || 0} ${c.cyan}(UNCHANGED)${c.reset}`);
    console.log(`   Rating: ${after?.rating || 0} (${after?.reviewCount || 0}) ${c.cyan}(UNCHANGED)${c.reset}`);
    console.log(`${c.green}   GST:${c.reset} "${after?.gstNumber}" ✅`);
    console.log(`${c.green}   PAN:${c.reset} "${after?.panNumber}" ✅`);
    console.log(`${c.green}   Description:${c.reset} Added ✅`);
    console.log(`${c.green}   Website:${c.reset} Added ✅`);
    console.log(`${c.green}   Certifications:${c.reset} ${after?.certifications?.length || 0} ✅`);
    console.log(`${c.green}   Categories:${c.reset} ${after?.productCategories?.length || 0} ✅`);
    console.log(`${c.green}   Export Markets:${c.reset} ${after?.exportMarkets?.length || 0} ✅`);
    console.log(`${c.green}   Factory Images:${c.reset} ${after?.factoryImages?.length || 0} ✅`);
    console.log(`${c.green}   Manufacturing Details:${c.reset} Added ✅`);
    console.log(`${c.green}   Verification Level:${c.reset} ${after?.verificationLevel} ✅`);
    console.log(`${c.green}   Trust Score:${c.reset} ${after?.trustScore} ✅`);
    console.log(`${c.green}   Trusted Seller:${c.reset} ${after?.isTrustedSeller} ✅`);
    console.log(`${c.green}   Subscription:${c.reset} ${after?.subscriptionPlan} (${after?.subscriptionStatus}) ✅`);
    
    console.log(`\n${c.cyan}========================================${c.reset}`);
    console.log(`${c.green}✅ IB ELECTRONICS PROFILE UPDATE COMPLETE!${c.reset}`);
    console.log(`${c.yellow}⚠️  Products=3, Orders=0, Revenue=0, Rating=5(1) - NO CHANGE${c.reset}`);
    console.log(`${c.cyan}========================================\n${c.reset}`);
    
  } catch (error) {
    console.error(`\n${c.red}❌ Error:${c.reset}`, error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

updateIBElectronics();