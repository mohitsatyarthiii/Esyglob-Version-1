import PDFDocument from 'pdfkit';

const heading = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
const printable = input => {
  if (input === null || input === undefined || input === '') return 'Not specified';
  if (Array.isArray(input)) return input.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ') || 'None';
  if (typeof input === 'object') return Object.entries(input).map(([key, item]) => `${heading(key)}: ${printable(item)}`).join('\n');
  return String(input);
};

export function streamAgreementPdf(res, tradeDocument, entityNumber) {
  const content = tradeDocument.metadata?.content || {};
  const pdf = new PDFDocument({ size: 'A4', margin: 52, info: { Title: tradeDocument.title } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${String(tradeDocument.filename || 'trade-agreement.pdf').replace(/[^a-zA-Z0-9._-]/g, '-')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  pdf.pipe(res);
  pdf.fillColor('#17345f').font('Helvetica-Bold').fontSize(10).text('ESYGLOB ENTERPRISE TRADE');
  pdf.moveDown(.5).fillColor('#111827').fontSize(23).text(tradeDocument.title);
  pdf.moveDown(.25).fillColor('#64748b').font('Helvetica').fontSize(10).text(`Agreement ${content.agreementNumber || entityNumber}  |  Revision ${content.revisionNumber || tradeDocument.version || 1}`);
  pdf.moveDown().strokeColor('#dbe3ef').moveTo(52, pdf.y).lineTo(543, pdf.y).stroke();
  for (const key of ['buyer','seller','products','pricing','minimumOrderQuantity','taxes','shipping','shippingTerms','delivery','packaging','samplePrice','paymentTerms','incoterms','specialConditions','notes','attachments','generatedAt']) {
    if (content[key] === undefined) continue;
    if (pdf.y > 700) pdf.addPage();
    pdf.moveDown(.7).fillColor('#17345f').font('Helvetica-Bold').fontSize(11).text(heading(key));
    pdf.moveDown(.2).fillColor('#334155').font('Helvetica').fontSize(9.5).text(printable(content[key]), { lineGap: 3 });
  }
  if (pdf.y > 630) pdf.addPage();
  pdf.moveDown(1.2).strokeColor('#dbe3ef').moveTo(52, pdf.y).lineTo(543, pdf.y).stroke();
  pdf.moveDown(.7).fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Electronic Signatures');
  for (const signature of tradeDocument.signatures || []) pdf.moveDown(.4).font('Helvetica').fontSize(9.5).text(`${heading(signature.signerRole)}: ${signature.signerName}  |  ${new Date(signature.signedAt).toLocaleString()}`);
  if (!(tradeDocument.signatures || []).length) pdf.moveDown(.4).font('Helvetica').fillColor('#64748b').fontSize(9.5).text('Awaiting required signatures.');
  pdf.moveDown(1.5).fillColor('#64748b').fontSize(8).text('Generated and retained by EsyGlob with a complete signature audit trail.');
  pdf.end();
}
