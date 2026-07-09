// This is a complete knowledge base with 33 categories, trade intelligence,
// buyer/seller guides, and 150+ subcategories

export const MARKETPLACE_KNOWLEDGE = [
  // ==================== PLATFORM CORE ====================
  {
    id: 'greeting',
    patterns: [
      /^(h+i+|h+e+y+|h+e+l+o+|hello+|namaste+|salam+|thanks+|thank\s+you+|ok+|okay+|yo+|sup+|hi there|good (morning|afternoon|evening|day))[\s.!?]*$/i,
    ],
    response: 'Hi, I am EsyGlob AI. I am here to help you source products, compare suppliers, check marketplace information, create RFQs, understand orders, and research business opportunities. What are you looking for today?'
  },
  {
    id: 'about_platform_full',
    patterns: [
      /what is esyglob/i, /about esyglob/i, /about (the )?platform/i,
      /tell me about (this )?(marketplace|platform|website)/i,
      /how does esyglob work/i, /what does esyglob do/i,
    ],
    response: `EsyGlob is a comprehensive B2B marketplace built for global sourcing and trade, currently hosting 620+ products across 33 categories.

📊 Platform Highlights:
• 33 Product Categories | 150+ Subcategories
• 620+ Active Product Listings
• Verified Suppliers from India & Global Markets
• Integrated RFQ System for Competitive Quoting
• Trade Assurance & Escrow Protection
• End-to-End Logistics & Customs Support

🏭 Core Categories: Agriculture, Apparel & Fashion, Automobile, Chemicals, Construction, Consumer Electronics, Food & Beverage, Furniture, Health & Beauty, Industrial Supplies, Machinery, Medical Supplies, Packaging, Sports, Toys, and 18 more.

🔗 Quick Links: /products | /manufacturers | /services | /categories`
  },
  {
    id: 'rfq_complete_guide',
    patterns: [
      /what is (an? )?rfq/i, /rfq (meaning|means|definition|system)/i,
      /request (for|a) quot/i, /how (to|do i) (create|make|post|submit) (an? )?rfq/i,
    ],
    response: `RFQ (Request for Quotation) - Complete Guide:

What is RFQ?
A system where you post your product requirements and multiple verified suppliers compete with quotes, ensuring you get the best price and terms.

📝 HOW TO CREATE AN EFFECTIVE RFQ:

1. Product Details:
• Product name and category
• Detailed specifications (size, material, color, grade)
• Reference images or links
• Required certifications (ISO, CE, FDA, etc.)

2. Quantity Requirements:
• Minimum quantity needed
• Target quantity for pricing
• Frequency (one-time, monthly, quarterly)
• Sample requirement (yes/no, quantity)

3. Price Expectations:
• Target price range (helps filter serious suppliers)
• Currency preference (INR/USD)
• Payment terms preference

4. Shipping Details:
• Destination country and port
• Preferred incoterms (FOB, CIF, EXW, DDP)
• Expected delivery timeline

📊 AFTER SUBMISSION:
• RFQ broadcast to relevant suppliers
• Receive quotes within 24-72 hours
• Compare all quotes side-by-side
• Message suppliers for clarifications
• Negotiate and select best quote
• Convert to order with Trade Assurance

🔗 Create RFQ: /rfqs/create`
  },
  {
    id: 'trade_assurance_detailed',
    patterns: [
      /trade assurance/i, /escrow/i, /safe payment/i, /buyer protection/i,
      /payment (protection|security|safety|guarantee)/i,
    ],
    response: `Trade Assurance & Payment Protection on EsyGlob:

🛡️ WHAT IS TRADE ASSURANCE?
An escrow-based protection system where your payment is held securely and only released to the supplier when you confirm satisfactory delivery.

🔒 PROTECTED ASPECTS:
• Product Quality: Must match agreed specifications
• Shipping Timeline: On-time delivery guarantee
• Quantity: Full order quantity delivered
• Documentation: Complete and accurate shipping docs

💰 PAYMENT FLOW:
1. You place order with Trade Assurance
2. Payment held in secure escrow
3. Supplier produces and ships order
4. You receive and inspect goods
5. If satisfied → Release payment to supplier
6. If issues → Raise dispute for resolution

⚖️ DISPUTE RESOLUTION:
• Raise dispute within 7 days of delivery
• Submit evidence (photos, videos, reports)
• EsyGlob mediation team reviews case
• Resolution typically within 7-14 days
• Options: refund, replacement, partial payment

⚠️ WITHOUT TRADE ASSURANCE:
• Direct payment to supplier
• No platform protection
• Disputes handled directly with supplier
• Recommended only for trusted, repeat suppliers`
  },
  {
    id: 'all_categories',
    patterns: [
      /(what|which|list|show|all|available) (product )?categor(y|ies)/i,
      /what (do you|does esyglob) (sell|offer|have)/i,
    ],
    response: `EsyGlob Product Categories (33 Categories | 150+ Subcategories | 620+ Products):

1. 🌾 AGRICULTURE - Seeds, Fertilizers, Pesticides, Farm Machinery, Irrigation
2. 👗 APPAREL & FASHION - Men's/Women's/Kids' Wear, Footwear, Accessories
3. 🚗 AUTOMOBILE - Car Accessories, Spare Parts, Tyres, Oils, Car Care
4. ⚗️ CHEMICALS - Industrial, Specialty, Basic, Inorganic, Organic
5. 💻 COMPUTER HARDWARE & SOFTWARE - Desktops, Laptops, Components
6. 🏗️ CONSTRUCTION - Building Materials, Cement, Steel, Paints
7. 📱 CONSUMER ELECTRONICS - TVs, Audio, Home Appliances, Mobile Phones
8. ⚡ ELECTRONICS & ELECTRICAL - Cables, Switches, Lighting, Fans
9. 🔋 ENERGY & POWER - Solar Power, Generators, Batteries, Inverters
10. 🍔 FOOD & BEVERAGE - Snacks, Beverages, Dairy, Bakery, Frozen Foods
11. 🛋️ FURNITURE - Living Room, Bedroom, Dining, Office, Outdoor
12. 🎁 GIFTS & CRAFTS - Gift Items, Handicrafts, Home Decor, Stationery
13. 💄 HEALTH & BEAUTY - Skin Care, Hair Care, Personal Care, Cosmetics
14. 🏠 HOME SUPPLIES - Cleaning, Kitchenware, Home Utilities, Storage
15. 🏥 HOSPITAL & MEDICAL SUPPLIES - Diagnostic, Surgical, Disposables
16. 🏨 HOTEL SUPPLIES - Hotel Furniture, Kitchen Equipment, Tableware
17. ⚙️ INDUSTRIAL SUPPLIES - Bearings, Fasteners, Tools, Material Handling
18. 💎 JEWELRY & GEMSTONES - Gold/Silver, Gemstones, Fashion Jewelry
19. 👜 LEATHER & LEATHER PRODUCTS - Bags, Wallets, Belts, Shoes
20. 🏭 MACHINERY - Industrial, Construction, Packaging, Printing, Textile
21. ⛏️ MINERAL & METALS - Iron/Steel, Aluminum, Copper, Scrap
22. 📚 OFFICE & SCHOOL SUPPLIES - Stationery, Paper, Desk Items
23. 🔬 PACKAGING & LAB INSTRUMENTS - Packaging Materials, Lab Equipment
24. 🌸 PERFUMERY - Perfumes, Essential Oils, Fragrances, Deodorants
25. 🔧 PIPES, TUBES & FITTINGS - Plastic Sheets, Containers, Pipes
26. 🧪 PLASTICS & PRODUCTS - Plastic Products, Molds, Components
27. 🔬 SCIENTIFIC & LAB INSTRUMENTS - Microscopes, Glassware, Testing Tools
28. ⚽ SPORTS & ENTERTAINMENT - Sports Goods, Outdoor Gear, Sportswear
29. 📡 TELECOMMUNICATIONS - Mobile Phones, Telecom Equipment, Networking
30. 🧸 TOYS - Soft Toys, Educational Toys, Action Figures, Puzzles
31. 🚛 TRANSPORTATION - Trucks, Buses, Spare Parts, Vehicle Accessories
32. 🌿 ENVIRONMENT & POLLUTION - Waste Management, Water Treatment
33. 🛡️ SAFETY & SECURITY - Safety Equipment, CCTV, Fire Safety

🔗 Browse all: /categories | Search: /products`
  },
  {
    id: 'buyer_guide_complete',
    patterns: [
      /how (to|do i|can i) (buy|source|purchase|order|procure)/i,
      /buyer guide/i, /buying (process|flow|guide|steps)/i,
    ],
    response: `Complete Buying Flow on EsyGlob:

Step 1: SEARCH & DISCOVER
→ Browse 33 categories or search specific products
→ Use filters: price range, MOQ, supplier location, verification status

Step 2: COMPARE SUPPLIERS
→ Check verification badges, ratings, trust scores
→ Compare MOQ, pricing, lead time, certifications
→ Review supplier profiles, past orders, reviews

Step 3: SHORTLIST & COMMUNICATE
→ Message 3-5 shortlisted suppliers
→ Share your specifications, quantity, target price
→ Ask for samples if needed

Step 4: CREATE RFQ (for bulk orders)
→ Go to /rfqs and submit requirements
→ Multiple suppliers compete with quotes
→ Compare side-by-side

Step 5: NEGOTIATE & FINALIZE
→ Review quotes, negotiate terms
→ Confirm incoterms (FOB/CIF/EXW)
→ Agree on payment terms and timeline

Step 6: PLACE ORDER
→ Use Trade Assurance for payment protection
→ Payment held in escrow until delivery confirmed
→ Track order status from dashboard

🔗 Start: /products | /categories`
  },
  {
    id: 'seller_guide_complete',
    patterns: [
      /how (to|do i|can i) sell/i, /seller guide/i,
      /how to (list|add|upload|register as) (a )?(seller|supplier|manufacturer|vendor)/i,
    ],
    response: `Complete Seller Onboarding on EsyGlob:

Step 1: REGISTRATION
→ Visit /seller/onboard
→ Provide business name, email, phone, company details
→ Select your product categories

Step 2: VERIFICATION
→ Submit business registration certificate
→ Upload tax registration (GST/VAT)
→ Provide address proof and bank details
→ Factory/production photos (for manufacturers)
→ Quality certifications if applicable
→ Verification takes 2-5 business days

Step 3: PROFILE SETUP
→ Complete company profile with description
→ Add export markets and production capacity
→ Upload company logo and facility images
→ List your competitive advantages

Step 4: ADD PRODUCTS
→ High-quality images (minimum 5 per product)
→ Detailed specifications in bullet points
→ Competitive pricing with MOQ tiers
→ Accurate lead time and shipping info

Step 5: START SELLING
→ Respond to buyer inquiries within 6 hours
→ Submit quotes on relevant RFQs
→ Offer competitive pricing and samples
→ Maintain high ratings through quality service

📈 Success Metrics:
• Complete 100% profile = 3x more visibility
• Verified badge = 5x more trust
• Fast RFQ response = 2x conversion rate
• Quality product images = 4x more inquiries`
  },
  {
    id: 'market_trends_2026',
    patterns: [
      /(market |trade )?trends?/i, /trending/i,
      /what('?s| is) (trending|hot|popular|in demand)/i,
    ],
    response: `📈 Global B2B Trade Trends 2026:

🔥 TOP 10 TRENDING CATEGORIES:

1. SUSTAINABLE PRODUCTS (35% Demand Growth)
• Organic textiles, biodegradable packaging, eco-friendly alternatives
• Green chemicals, recycled materials
• Solar/renewable energy products

2. ELECTRONICS & GADGETS
• TWS earbuds (40% YoY growth)
• GaN chargers replacing traditional adapters
• Smart home IoT devices
• Portable power stations

3. ATHLEISURE & ACTIVEWEAR
• Global market: $550 Billion
• Yoga wear, gym clothing, sports accessories
• Sustainable activewear gaining premium

4. ORGANIC FOOD & SPICES
• Organic turmeric, ginger, ashwagandha
• Millets & ancient grains
• Ready-to-cook ethnic food mixes

5. ELECTRIC VEHICLE COMPONENTS
• EV batteries, chargers, controllers
• Conversion kits for existing vehicles
• Charging infrastructure equipment

6. MEDICAL & WELLNESS DEVICES
• Home diagnostic devices
• Telemedicine equipment
• Ayurvedic/wellness products

7. PACKAGING MACHINERY
• Automatic food packaging lines
• Eco-friendly packaging solutions

8. HOME OFFICE FURNITURE
• Ergonomic chairs and desks
• Space-saving furniture

9. SOLAR ENERGY PRODUCTS
• Solar panels, inverters, batteries
• Solar water pumps for agriculture

10. PET SUPPLIES
• Premium pet food
• Pet accessories and toys

🌍 REGIONAL TRENDS:
• Africa: Mobile phones, auto parts, machinery (rapid growth)
• Middle East: Construction materials, food, luxury goods
• Southeast Asia: Electronics, machinery, chemicals

🔗 Explore trending products: /products?sort=popular`
  },
  {
    id: 'fallback_help',
    patterns: [
      /help/i, /support/i, /(how|what) (can|do) (you|i) (help|do|assist)/i,
    ],
    response: `I can help you with everything on EsyGlob! Here's what I know:

🔍 PRODUCT SOURCING
• Search across 33 categories and 620+ products
• Compare suppliers, prices, and MOQs
• Get detailed product information
• Find trending and seasonal products

📋 RFQ & ORDERING
• Create and manage RFQs
• Understand the buying process
• Trade Assurance and payment protection
• Shipping and logistics guidance

🏭 SUPPLIER INFORMATION
• Verification status and documents
• Ratings, reviews, and trust scores
• Supplier comparison tips
• Negotiation strategies

🌍 MARKET INTELLIGENCE
• Country-specific trade insights
• Import/export trends
• Seasonal product opportunities
• Category-specific market data

💡 HOW TO START:
Just ask me anything! For example:
• "Find t-shirts suppliers from India"
• "What's trending in electronics?"
• "How do I create an RFQ?"
• "Tell me about shipping to USA"
• "Compare verified furniture suppliers"

What would you like to know?`
  },
];

export function matchKnowledgeResponse(message) {
  const text = String(message || '').trim();
  if (!text) return null;

  const match = MARKETPLACE_KNOWLEDGE.find(entry =>
    entry.patterns.some(pattern => pattern.test(text))
  );

  if (!match) return null;

  return {
    source: 'knowledge_base',
    intent: match.id,
    response: match.response,
  };
}

export default MARKETPLACE_KNOWLEDGE;