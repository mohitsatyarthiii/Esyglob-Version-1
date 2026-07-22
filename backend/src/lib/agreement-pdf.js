import PDFDocument from 'pdfkit';

const heading = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
const drawnSignature = value => {
  const match = String(value || '').match(/^data:image\/(?:png|jpeg);base64,(.+)$/);
  return match ? Buffer.from(match[1], 'base64') : null;
};
const printable = input => {
  if (input === null || input === undefined || input === '') return 'Not specified';
  if (Array.isArray(input)) return input.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ') || 'None';
  if (typeof input === 'object') return Object.entries(input).map(([key, item]) => `${heading(key)}: ${printable(item)}`).join('\n');
  return String(input);
};

export function streamAgreementPdf(res, tradeDocument, entityNumber) {
  const content = tradeDocument.metadata?.content || {};
  const isFinalQuotation = Boolean(tradeDocument.metadata?.isFinalQuotation);
  const pdf = new PDFDocument({ size: 'A4', margin: 52, info: { Title: tradeDocument.title } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${String(tradeDocument.filename || 'trade-agreement.pdf').replace(/[^a-zA-Z0-9._-]/g, '-')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  pdf.pipe(res);
  pdf.roundedRect(52, 45, 28, 28, 7).fill('#2563eb');
  pdf.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('E', 61, 52, { width: 12, align: 'center' });
  pdf.fillColor('#17345f').font('Helvetica-Bold').fontSize(10).text('ESYGLOB ENTERPRISE TRADE', 90, 49);
  pdf.fillColor('#64748b').font('Helvetica').fontSize(8).text(isFinalQuotation ? 'Official Signed Final Quotation' : 'International Commercial Agreement', 90, 63);
  pdf.y = 87;
  pdf.moveDown(.5).fillColor('#111827').fontSize(23).text(tradeDocument.title);
  pdf.moveDown(.25).fillColor('#64748b').font('Helvetica').fontSize(10).text(`${isFinalQuotation ? 'Final Quotation' : 'Agreement'} ${content.finalQuotationNumber || content.agreementNumber || entityNumber}  |  RFQ ${content.rfqNumber || '—'}  |  Quotation ${content.quotationNumber || entityNumber}  |  Version ${tradeDocument.version || content.revisionNumber || 1}`);
  pdf.moveDown(.2).fontSize(8.5).text(`${isFinalQuotation ? 'Final Quotation' : 'Agreement'} Date: ${new Date(content.generatedAt || tradeDocument.createdAt).toLocaleDateString()}`);
  pdf.moveDown().strokeColor('#dbe3ef').moveTo(52, pdf.y).lineTo(543, pdf.y).stroke();
  for (const key of ['buyer','seller','products','pricing','minimumOrderQuantity','taxes','production','shipping','shippingTerms','delivery','packaging','warranty','samplePrice','paymentTerms','incoterms','specialConditions','notes','attachments','generatedAt']) {
    if (content[key] === undefined) continue;
    if (pdf.y > 700) pdf.addPage();
    pdf.moveDown(.7).fillColor('#17345f').font('Helvetica-Bold').fontSize(11).text(heading(key));
    pdf.moveDown(.2).fillColor('#334155').font('Helvetica').fontSize(9.5).text(printable(content[key]), { lineGap: 3 });
  }
  if (pdf.y > 630) pdf.addPage();
  pdf.moveDown(1.2).strokeColor('#dbe3ef').moveTo(52, pdf.y).lineTo(543, pdf.y).stroke();
  pdf.moveDown(.7).fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Electronic Signatures');
  for (const signature of tradeDocument.signatures || []) {
    pdf.moveDown(.6).fillColor('#111827').font('Helvetica-Bold').fontSize(9.5).text(`${heading(signature.signerRole)}: ${signature.signerName}`);
    if (signature.signatureType === 'drawn' && String(signature.signatureValue || '').startsWith('data:image/')) {
      try { pdf.image(drawnSignature(signature.signatureValue), { fit: [160, 48] }); } catch { pdf.font('Helvetica-Oblique').text('Drawn signature retained in the electronic audit record.'); }
    } else {
      pdf.fillColor('#17345f').font('Helvetica-Oblique').fontSize(15).text(String(signature.signatureValue || signature.signerName).slice(0, 120));
    }
    pdf.fillColor('#64748b').font('Helvetica').fontSize(8).text(`Signed ${new Date(signature.signedAt).toLocaleString()}  |  Method: ${heading(signature.signatureType)}  |  ${isFinalQuotation ? 'Final Quotation' : 'Agreement'} v${tradeDocument.version || 1}`);
  }
  if (!(tradeDocument.signatures || []).length) pdf.moveDown(.4).font('Helvetica').fillColor('#64748b').fontSize(9.5).text('Awaiting required signatures.');
  pdf.moveDown(1.5).fillColor('#64748b').fontSize(8).text('Generated and retained by EsyGlob with a complete signature audit trail.');
  pdf.end();
}
