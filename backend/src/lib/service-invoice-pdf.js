import PDFDocument from 'pdfkit';

const money = (value, currency) => `${currency} ${Number(value || 0).toFixed(2)}`;
export function streamServiceInvoicePdf(invoice, res) {
  const service = invoice.serviceSnapshot || {};
  const pricing = service.pricing || {};
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Invoice ${invoice.invoiceNumber}` } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNumber}.pdf"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  doc.pipe(res);
  doc.fillColor('#2563EB').fontSize(25).font('Helvetica-Bold').text('ESYGLOB');
  doc.fillColor('#111827').fontSize(18).text('SERVICE INVOICE', { align: 'right' });
  doc.moveDown().strokeColor('#E5E7EB').moveTo(48, doc.y).lineTo(547, doc.y).stroke().moveDown();
  doc.fontSize(10).font('Helvetica-Bold').text(`Invoice: ${invoice.invoiceNumber}`);
  doc.font('Helvetica').text(`Booking: ${service.requestNumber || '-'}`).text(`Transaction: ${invoice.transactionId || '-'}`).text(`Payment date: ${invoice.paymentDate ? new Date(invoice.paymentDate).toLocaleString('en-IN') : '-'}`);
  doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Service');
  doc.font('Helvetica').fontSize(10).text(service.serviceTitle || 'EsyGlob managed service').text(`Service ID: ${service.serviceKey || '-'}`);
  doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Price summary');
  const rows = [['Base service cost', pricing.baseCost], ['Additional charges', pricing.additionalCharges], ['GST / Taxes', Number(pricing.gstAmount || 0) + Number(pricing.taxAmount || 0)], ['Platform fee', pricing.platformFee], ['Discount', -Number(pricing.discount || 0)]];
  rows.forEach(([label, value]) => { doc.font('Helvetica').fontSize(10).text(String(label), { continued: true }).text(money(value, invoice.currency), { align: 'right' }); });
  doc.moveDown(.5).strokeColor('#E5E7EB').moveTo(48, doc.y).lineTo(547, doc.y).stroke().moveDown(.5);
  doc.font('Helvetica-Bold').fontSize(13).text('Grand total', { continued: true }).text(money(invoice.totalAmount, invoice.currency), { align: 'right' });
  doc.moveDown(2).fontSize(10).text('Payment status: PAID').text('Payment method: Razorpay');
  doc.moveDown(2).font('Helvetica-Bold').text('Terms');
  (invoice.terms || []).forEach(term => doc.font('Helvetica').text(`• ${term}`));
  doc.moveDown(3).fillColor('#6B7280').fontSize(9).text('EsyGlob — Global B2B trade services', { align: 'center' }).text('This is a system-generated invoice.', { align: 'center' });
  doc.end();
}
