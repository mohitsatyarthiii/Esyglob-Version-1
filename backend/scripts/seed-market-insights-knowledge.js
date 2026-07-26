import PDFDocument from 'pdfkit';
import { connectToAIKnowledgeDatabase, closeAIKnowledgeDatabase } from '../src/config/knowledge-database.js';
import KnowledgeBaseService from '../src/services/knowledge-base.service.js';
import { extractKnowledgeContent } from '../src/lib/knowledge-ingestion.js';

const sources = [
  {
    slug: 'india-textile-industry-report-2025',
    title: 'India Textile Industry Report 2025',
    folderPath: 'market-insights/countries/india/industries/textiles/government-reports',
    category: 'market-insights',
    subcategory: 'india-textiles',
    documentType: 'government-industry-report',
    keywords: ['india', 'textiles', 'apparel', 'cotton', 'exports', 'employment', 'hs-50-63'],
    sourceUrl: 'https://texmin.nic.in/sites/default/files/MOT%202024-25%20English%20Report%2012.03.2025.pdf',
    paragraphs: [
      'Scope and evidence. This research brief organizes verified indicators from the Ministry of Textiles Annual Report 2024-2025 and the Department of Commerce trade-data framework. Values retain the source period and should not be treated as forecasts.',
      'Industry position. India was the world’s sixth-largest exporter of textiles and apparel in 2023. Textiles, apparel and handicrafts represented 8.21 percent of India’s total exports in 2023-24, while India represented 3.9 percent of global textile and apparel trade. The United States and European Union together accounted for around 47 percent of India’s textile and apparel export destinations.',
      'Employment and value chain. The sector directly employs around 45 million people and supports livelihoods for more than 100 million people indirectly. Its value chain spans fibre production, spinning, weaving, processing, apparel, made-ups and handicrafts, creating materially different economics and compliance requirements by segment.',
      'Cotton context. Cotton accounts for around 23 percent of global fibre production. India had 113.60 lakh hectares under cotton cultivation, around 36 percent of the reported world cotton area of 316.20 lakh hectares. Around 62 percent of Indian cotton is produced in rain-fed areas and 38 percent in irrigated areas. Productivity for the 2024-25 cotton season was reported around 448 kilograms per hectare.',
      'Commercial interpretation. Export opportunity is strongest where suppliers combine dependable quality, traceability, product-specific certification and responsive lead times. Exposure to rain-fed cotton production, fragmented processing, sustainability requirements and destination-market compliance can affect cost and reliability.',
      'Recommended diligence. Product classification must be narrowed within HS chapters 50 through 63. Buyers should distinguish fibre, yarn, fabric, apparel and made-up products, validate the destination’s labeling and chemical requirements, and compare landed cost using consistent Incoterms.',
    ],
    tables: [
      {
        title: 'Verified India textile indicators',
        lines: [
          'Indicator | Value | Period',
          'World export rank | 6 | 2023',
          'Share of India total exports | 8.21 percent | 2023-24',
          'Share of global textile trade | 3.9 percent | 2023',
          'USA and EU destination share | 47 percent | Latest cited',
          'Direct employment | 45 million people | Latest cited',
          'Indirect livelihoods | 100 million people | Latest cited',
        ],
      },
      {
        title: 'Cotton production context',
        lines: [
          'Indicator | Value | Period',
          'India cotton area | 113.60 lakh hectares | 2024-25',
          'Share of world cotton area | 36 percent | 2024-25',
          'Rain-fed production share | 62 percent | 2024-25',
          'Irrigated production share | 38 percent | 2024-25',
          'Cotton productivity | 448 kg per hectare | 2024-25',
        ],
      },
    ],
    references: [
      'Ministry of Textiles, Government of India — Annual Report 2024-2025.',
      'Department of Commerce, Government of India — Trade Intelligence and Analytics Portal; textiles classified primarily under HS chapters 50-63.',
    ],
  },
  {
    slug: 'uae-steel-market-report-2025',
    title: 'UAE Steel Market Report 2025',
    folderPath: 'market-insights/countries/uae/industries/steel/industry-analysis',
    category: 'market-insights',
    subcategory: 'uae-steel',
    documentType: 'industry-market-report',
    keywords: ['uae', 'steel', 'crude steel', 'fabrication', 'industrial policy', 'construction', 'hs-72', 'hs-73'],
    sourceUrl: 'https://worldsteel.org/media/press-releases/2025/december-2024-crude-steel-production-and-2024-global-totals/',
    paragraphs: [
      'Scope and evidence. This brief combines World Steel Association 2024 production statistics with official UAE Ministry of Economy information on industrial clustering, investment incentives and the steel-fabrication ecosystem. Production statistics are historical observations rather than market-size forecasts.',
      'Production position. Worldsteel reported United Arab Emirates crude steel production of 3.7 million tonnes in 2024 compared with 3.8 million tonnes in 2023, a decline of 1.4 percent. The country ranked thirty-eighth in the published 2024 country table. These figures measure crude steel production and do not represent total steel consumption, imports or fabricated-product demand.',
      'Regional fabrication ecosystem. The UAE supports an established fabrication and machinery ecosystem serving construction, energy, transport and regional re-export demand. The annual SteelFab event in Sharjah covers metalworking, welding, cutting, tube and pipe, robotics, lasers and related production technologies.',
      'Industrial policy. UAE industrial incentives described by the Ministry of Economy include competitive financing for priority industries, energy support, customs exemptions on qualifying machinery and production inputs, the In-Country Value programme and Make it in the Emirates.',
      'Cluster and trade direction. The National Cluster Strategy emphasizes collaboration between companies, specialized suppliers, research institutions and government bodies. Published five-year milestones include AED 20-30 billion in annual national GDP growth and AED 15 billion growth in foreign trade value across the broader cluster strategy; these are economy-wide cluster targets and must not be represented as steel forecasts.',
      'Commercial interpretation. Opportunity assessment should separate upstream steelmaking, service centres, tube and pipe, structural fabrication and specialist alloys. Each segment has different standards, energy exposure, buyer qualification cycles and import economics.',
      'Recommended diligence. Verify the product under HS chapter 72 or 73, map applicable conformity requirements, compare local conversion against imported finished products, and test demand through fabricators, EPC contractors and distributors. Sustainability evidence and low-carbon procurement requirements should be monitored.',
    ],
    tables: [
      {
        title: 'UAE crude steel production',
        lines: [
          'Year | Production million tonnes | Change percent',
          '2023 | 3.8 | Not applicable',
          '2024 | 3.7 | -1.4',
        ],
      },
      {
        title: 'UAE industrial strategy milestones',
        lines: [
          'Measure | Published target | Scope',
          'Annual national GDP growth | AED 20-30 billion | National clusters',
          'Foreign trade value growth | AED 15 billion | National clusters',
          'Average annual GDP growth | 7 percent | National clusters',
        ],
      },
    ],
    references: [
      'World Steel Association — December 2024 crude steel production and 2024 global totals.',
      'UAE Ministry of Economy — Benefits for the Industrial Sector.',
      'UAE Ministry of Economy — UAE National Cluster Strategy.',
      'UAE Ministry of Economy — SteelFab industry profile.',
    ],
  },
];

function createPdf(source) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#14213d').text(source.title);
    doc.moveDown(.4).font('Helvetica').fontSize(8).fillColor('#5d687a')
      .text(`Knowledge hierarchy: ${source.folderPath}`)
      .text(`Source reference: ${source.sourceUrl}`);
    doc.moveDown(1);
    source.paragraphs.forEach(paragraph => {
      doc.font('Helvetica').fontSize(9.5).fillColor('#334155').text(paragraph, { align: 'justify', lineGap: 3 });
      doc.moveDown(.7);
    });
    source.tables.forEach(table => {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#14213d').text(table.title);
      doc.moveDown(.3);
      table.lines.forEach(line => doc.font('Courier').fontSize(7.2).fillColor('#334155').text(line));
      doc.moveDown(.8);
    });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#14213d').text('References');
    source.references.forEach((reference, index) => doc.font('Helvetica').fontSize(8).fillColor('#334155').text(`${index + 1}. ${reference}`));
    doc.end();
  });
}

async function main() {
  await connectToAIKnowledgeDatabase();
  const seeded = [];
  try {
    for (const source of sources) {
      const buffer = await createPdf(source);
      const content = await extractKnowledgeContent({
        buffer,
        originalname: `${source.slug}.pdf`,
        mimetype: 'application/pdf',
      });
      const result = await KnowledgeBaseService.ingest({
        payload: {
          title: source.title,
          slug: source.slug,
          category: source.category,
          subcategory: source.subcategory,
          folderPath: source.folderPath,
          documentType: source.documentType,
          keywords: source.keywords,
          searchTerms: source.keywords,
          intentTags: ['market_research', 'market_insights'],
          targetRoles: ['All Users'],
          supportedLanguages: ['en'],
          priority: 100,
          status: 'published',
          version: 1,
          force: true,
          metadata: { hierarchy: source.folderPath.split('/'), authoritativeSources: source.references, sourceUrl: source.sourceUrl },
        },
        content,
        source: {
          type: 'pdf',
          fileName: `${source.slug}.pdf`,
          mimeType: 'application/pdf',
          uri: `knowledge://${source.folderPath}/${source.slug}.pdf`,
        },
      });
      seeded.push({
        id: String(result.document._id),
        title: result.document.title,
        folderPath: result.document.folderPath,
        chunks: result.document.chunkCount,
        embeddedChunks: result.embeddedChunks,
        pdfBytes: buffer.length,
      });
    }
    console.log(JSON.stringify({ success: true, seeded }, null, 2));
  } finally {
    await closeAIKnowledgeDatabase();
  }
}

main().catch(async error => {
  console.error(error);
  await closeAIKnowledgeDatabase().catch(() => undefined);
  process.exitCode = 1;
});
