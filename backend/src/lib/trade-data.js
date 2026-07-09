// Country profiles and trade rules
export const COUNTRIES = [
  { name:'India', code:'IND', flag:'IN', flagEmoji:'🇮🇳', region:'South Asia', capital:'New Delhi', currency:'INR', ports:['Nhava Sheva', 'Mundra', 'Chennai'], policy:'Import licensing and BIS certification may apply for regulated goods.', stability:72 },
  { name:'China', code:'CHN', flag:'CN', flagEmoji:'🇨🇳', region:'East Asia', capital:'Beijing', currency:'CNY', ports:['Shanghai', 'Ningbo-Zhoushan', 'Shenzhen'], policy:'CCC certification and customs inspection may apply for regulated categories.', stability:76 },
  { name:'United States', code:'USA', flag:'US', flagEmoji:'🇺🇸', region:'North America', capital:'Washington D.C.', currency:'USD', ports:['Los Angeles', 'Long Beach', 'New York/New Jersey'], policy:'CBP entry, product labeling, and agency rules apply by category.', stability:88 },
  { name:'Germany', code:'DEU', flag:'DE', flagEmoji:'🇩🇪', region:'Europe', capital:'Berlin', currency:'EUR', ports:['Hamburg', 'Bremerhaven', 'Duisburg'], policy:'EU CE marking, REACH, and customs documentation may apply.', stability:87 },
  { name:'Vietnam', code:'VNM', flag:'VN', flagEmoji:'🇻🇳', region:'Southeast Asia', capital:'Hanoi', currency:'VND', ports:['Cat Lai', 'Hai Phong', 'Cai Mep'], policy:'Product standards and customs valuation checks apply by HS classification.', stability:73 },
  { name:'UAE', code:'ARE', flag:'AE', flagEmoji:'🇦🇪', region:'Middle East', capital:'Abu Dhabi', currency:'AED', ports:['Jebel Ali', 'Khalifa Port', 'Port Rashid'], policy:'GCC conformity and Arabic labeling may apply for regulated imports.', stability:84 },
  { name:'Turkey', code:'TUR', flag:'TR', flagEmoji:'🇹🇷', region:'Middle East', capital:'Ankara', currency:'TRY', ports:['Ambarli', 'Mersin', 'Izmir'], policy:'TAREKS risk-based control and product conformity can apply.', stability:63 },
  { name:'Bangladesh', code:'BGD', flag:'BD', flagEmoji:'🇧🇩', region:'South Asia', capital:'Dhaka', currency:'BDT', ports:['Chittagong', 'Mongla', 'Payra'], policy:'Import registration certificates and customs documentation are commonly required.', stability:58 },
  { name:'Indonesia', code:'IDN', flag:'ID', flagEmoji:'🇮🇩', region:'Southeast Asia', capital:'Jakarta', currency:'IDR', ports:['Tanjung Priok', 'Tanjung Perak', 'Belawan'], policy:'SNI standards, import approvals, and product labeling may apply.', stability:69 },
  { name:'Brazil', code:'BRA', flag:'BR', flagEmoji:'🇧🇷', region:'South America', capital:'Brasilia', currency:'BRL', ports:['Santos', 'Paranagua', 'Rio de Janeiro'], policy:'SISCOMEX registration and product-specific agency approvals may apply.', stability:61 },
  { name:'Japan', code:'JPN', flag:'JP', flagEmoji:'🇯🇵', region:'East Asia', capital:'Tokyo', currency:'JPY', ports:['Tokyo', 'Yokohama', 'Kobe'], policy:'JIS, food sanitation, and product safety rules apply by category.', stability:90 },
  { name:'South Korea', code:'KOR', flag:'KR', flagEmoji:'🇰🇷', region:'East Asia', capital:'Seoul', currency:'KRW', ports:['Busan', 'Incheon', 'Gwangyang'], policy:'KC certification and customs inspection may apply for regulated goods.', stability:83 },
  { name:'United Kingdom', code:'GBR', flag:'GB', flagEmoji:'🇬🇧', region:'Europe', capital:'London', currency:'GBP', ports:['Felixstowe', 'Southampton', 'London Gateway'], policy:'UKCA marking and customs declarations apply where relevant.', stability:85 },
  { name:'Canada', code:'CAN', flag:'CA', flagEmoji:'🇨🇦', region:'North America', capital:'Ottawa', currency:'CAD', ports:['Vancouver', 'Montreal', 'Prince Rupert'], policy:'CBSA entry, bilingual labeling, and agency rules may apply.', stability:89 },
  { name:'Australia', code:'AUS', flag:'AU', flagEmoji:'🇦🇺', region:'Oceania', capital:'Canberra', currency:'AUD', ports:['Melbourne', 'Sydney', 'Brisbane'], policy:'Biosecurity, product safety, and customs rules apply by category.', stability:88 },
  { name:'Saudi Arabia', code:'SAU', flag:'SA', flagEmoji:'🇸🇦', region:'Middle East', capital:'Riyadh', currency:'SAR', ports:['Jeddah Islamic Port', 'King Abdulaziz Port', 'Jubail'], policy:'SABER conformity certification is required for many imports.', stability:78 },
  { name:'Thailand', code:'THA', flag:'TH', flagEmoji:'🇹🇭', region:'Southeast Asia', capital:'Bangkok', currency:'THB', ports:['Laem Chabang', 'Bangkok Port', 'Map Ta Phut'], policy:'TISI standards and import licensing may apply.', stability:66 },
  { name:'Malaysia', code:'MYS', flag:'MY', flagEmoji:'🇲🇾', region:'Southeast Asia', capital:'Kuala Lumpur', currency:'MYR', ports:['Port Klang', 'Tanjung Pelepas', 'Penang'], policy:'SIRIM approvals and import permits may apply by product.', stability:75 },
  { name:'Singapore', code:'SGP', flag:'SG', flagEmoji:'🇸🇬', region:'Southeast Asia', capital:'Singapore', currency:'SGD', ports:['Singapore'], policy:'TradeNet declarations and product agency controls apply where relevant.', stability:93 },
  { name:'Mexico', code:'MEX', flag:'MX', flagEmoji:'🇲🇽', region:'North America', capital:'Mexico City', currency:'MXN', ports:['Manzanillo', 'Veracruz', 'Lazaro Cardenas'], policy:'NOM standards and customs broker processing may apply.', stability:62 },
  { name:'Italy', code:'ITA', flag:'IT', flagEmoji:'🇮🇹', region:'Europe', capital:'Rome', currency:'EUR', ports:['Genoa', 'Trieste', 'La Spezia'], policy:'EU customs, CE, and product safety rules apply by category.', stability:78 },
  { name:'France', code:'FRA', flag:'FR', flagEmoji:'🇫🇷', region:'Europe', capital:'Paris', currency:'EUR', ports:['Le Havre', 'Marseille Fos', 'Dunkirk'], policy:'EU customs, CE, labeling, and agency rules may apply.', stability:81 },
  { name:'Netherlands', code:'NLD', flag:'NL', flagEmoji:'🇳🇱', region:'Europe', capital:'Amsterdam', currency:'EUR', ports:['Rotterdam', 'Amsterdam', 'Moerdijk'], policy:'EU customs and product compliance rules apply; Rotterdam is a major gateway.', stability:89 },
  { name:'South Africa', code:'ZAF', flag:'ZA', flagEmoji:'🇿🇦', region:'Africa', capital:'Pretoria', currency:'ZAR', ports:['Durban', 'Cape Town', 'Ngqura'], policy:'SARS customs and NRCS standards may apply by product.', stability:55 },
];

export const SOURCE_CHIPS = [
  { name:'World Bank', url:'https://data.worldbank.org' },
  { name:'WTO', url:'https://www.wto.org' },
  { name:'OECD', url:'https://www.oecd.org' },
  { name:'Trading Economics', url:'https://tradingeconomics.com' },
  { name:'FAOSTAT', url:'https://www.fao.org/faostat' },
  { name:'Exchange Rate API', url:'https://www.exchangerate-api.com' },
  { name:'Marketplace Database', url:'/products' },
  { name:'Groq AI', url:'https://groq.com' },
];

export const PRODUCT_RULES = [
  { match:['coffee','tea','rice','spice','grain','food','agriculture','fruit'], family:'food', tariff:19.8, certifications:['Phytosanitary Certificate', 'Certificate of Origin', 'Food safety declaration'], packaging:['Moisture-resistant export cartons', 'Batch and origin labeling', 'Food-grade inner liner'], season:'Harvest and festival buying windows' },
  { match:['textile','garment','fabric','apparel','cotton','yarn'], family:'textiles', tariff:17.8, certifications:['OEKO-TEX where required', 'Country of Origin', 'Fiber composition labeling'], packaging:['Bale/carton compression', 'Humidity protection', 'Size/color labeling'], season:'Retail season planning and back-to-school/festival cycles' },
  { match:['electronics','battery','phone','component','semiconductor','led'], family:'electronics', tariff:4.8, certifications:['CE/FCC/KC as applicable', 'RoHS declaration', 'Battery transport documents if applicable'], packaging:['ESD-safe packaging', 'Shock-resistant cartons', 'Serial/batch labeling'], season:'Procurement cycles before product launches and holiday retail' },
  { match:['machine','machinery','equipment','tool','pump','motor'], family:'machinery', tariff:4.2, certifications:['CE machinery directive where applicable', 'Inspection certificate', 'Technical datasheet'], packaging:['Crated export packing', 'Rust prevention', 'Spare parts list'], season:'Project procurement and fiscal-year capex cycles' },
  { match:['chemical','pharma','medicine','drug'], family:'chemicals', tariff:5.2, certifications:['SDS/MSDS', 'COA', 'Import license if regulated'], packaging:['UN-rated packaging if hazardous', 'Clear hazard labeling', 'Temperature control where needed'], season:'Contract tender and inventory replenishment cycles' },
  { match:['steel','metal','aluminum','copper','mineral'], family:'metals', tariff:7.8, certifications:['Mill test certificate', 'Certificate of Origin', 'Inspection certificate'], packaging:['Bundled or palletized loads', 'Corrosion protection', 'Heat/batch marking'], season:'Construction and manufacturing demand cycles' },
];

// Helper functions
export function normalizeText(value) {
  return String(value || '').trim().slice(0, 120);
}

export function fmtUSD(value) {
  if (!value && value !== 0) return 'N/A';
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

export function fmtNumber(value) {
  if (!value && value !== 0) return 'N/A';
  return Number(value).toLocaleString('en-US');
}

export function productProfile(productName, category = '') {
  const haystack = `${productName} ${category}`.toLowerCase();
  return PRODUCT_RULES.find(rule => rule.match.some(term => haystack.includes(term))) || {
    family:'general',
    tariff:9.5,
    certifications:['Commercial invoice', 'Packing list', 'Certificate of Origin if requested'],
    packaging:['Export-grade cartons or pallets', 'Clear product labeling', 'Moisture and transit protection'],
    season:'Buyer cycles vary by product and destination market',
  };
}

export function trendFrom(current, previous) {
  if (!current || !previous) return { label:'Stable', direction:'stable', change:0 };
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (change > 1) return { label:'Growing', direction:'up', change:Number(change.toFixed(1)) };
  if (change < -1) return { label:'Declining', direction:'down', change:Number(change.toFixed(1)) };
  return { label:'Stable', direction:'stable', change:Number(change.toFixed(1)) };
}

export function normalizedRows(rows) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.value || 0)), 0);
  return rows.map(row => ({
    ...row,
    share: total ? Number(((Math.max(0, Number(row.value || 0)) / total) * 100).toFixed(1)) : 0,
    globalShare: total ? Number(((Math.max(0, Number(row.value || 0)) / total) * 100).toFixed(1)) : 0,
  }));
}