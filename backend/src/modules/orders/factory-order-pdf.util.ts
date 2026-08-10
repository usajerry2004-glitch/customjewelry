import { Order } from '../../database/entities/order.entity';

// Plain require, not a typed import: without esModuleInterop, `import
// PDFDocument from 'pdfkit'` resolves to the module's `.default`, which
// doesn't exist on pdfkit's CJS export.
const PDFDocument = require('pdfkit');

const NAVY = '#0D1B35';
const GOLD = '#C09B58';
const MUTED = '#9CA3AF';
const NOTE_BG = '#FFFBEB';
const NOTE_BORDER = '#FDE68A';
const NOTE_LABEL = '#B45309';
const NOTE_TEXT = '#78350F';
const BORDER = '#E5E0D8';

const MARGIN = 42;
const PAGE_WIDTH = 595.28; // A4 pt
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function factoryLabel(factory: string | null | undefined): string {
  if (!factory) return '—';
  return factory.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
}

function supplySourceLabel(source: string | null | undefined): string {
  if (!source) return '—';
  return source.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
}

// Two-column key/value grid, matching the "Order Details" / "Product Specs"
// sections on the order detail page (frontend/src/pages/orders/[id].tsx).
function drawFieldGrid(doc: PDFKit.PDFDocument, fields: { label: string; value: string }[], startY: number): number {
  const colWidth = CONTENT_WIDTH / 2;
  let y = startY;
  for (let i = 0; i < fields.length; i += 2) {
    const rowFields = fields.slice(i, i + 2);
    let maxRowHeight = 0;
    rowFields.forEach((f, col) => {
      const x = MARGIN + col * colWidth;
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(f.label.toUpperCase(), x, y, { width: colWidth - 12, characterSpacing: 0.3 });
      const labelHeight = doc.heightOfString(f.label.toUpperCase(), { width: colWidth - 12 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
        .text(f.value || '—', x, y + labelHeight + 2, { width: colWidth - 12 });
      const valueHeight = doc.heightOfString(f.value || '—', { width: colWidth - 12 });
      maxRowHeight = Math.max(maxRowHeight, labelHeight + valueHeight + 2);
    });
    y += maxRowHeight + 12;
  }
  return y;
}

function sectionLabel(doc: PDFKit.PDFDocument, text: string, y: number): number {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED)
    .text(text.toUpperCase(), MARGIN, y, { characterSpacing: 0.8 });
  return y + 16;
}

export async function buildFactoryOrderPdf(order: Order): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // ── Header ──
  doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text('KIRA JEWELS', MARGIN, MARGIN);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD).text('MANUFACTURING ORDER', MARGIN, MARGIN + 22, { characterSpacing: 1.2 });

  doc.font('Helvetica-Bold').fontSize(15).fillColor(NAVY)
    .text(order.poNumber, MARGIN, MARGIN, { width: CONTENT_WIDTH, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#6B7280')
    .text(`Factory: ${factoryLabel(order.assignedFactory)}`, MARGIN, MARGIN + 20, { width: CONTENT_WIDTH, align: 'right' });
  doc.text(`Issued ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    MARGIN, MARGIN + 33, { width: CONTENT_WIDTH, align: 'right' });

  doc.moveTo(MARGIN, MARGIN + 54).lineTo(MARGIN + CONTENT_WIDTH, MARGIN + 54).lineWidth(1.5).strokeColor(NAVY).stroke();

  let y = MARGIN + 72;

  // ── Order Details ──
  y = sectionLabel(doc, 'Order Details', y);
  y = drawFieldGrid(doc, [
    { label: 'Customer PO#', value: order.refCustomerPo || '—' },
    { label: 'Kira SKU', value: order.kiraSkuNumber || '—' },
    { label: 'Order Type', value: order.orderType || '—' },
    { label: 'Manufacturing Path', value: order.manufacturingPath || '—' },
    { label: 'Stone Supplier', value: supplySourceLabel(order.supplySource) },
    { label: 'Factory', value: factoryLabel(order.assignedFactory) },
    { label: 'Reference Link', value: order.referenceWeblink || '—' },
  ], y);

  y += 6;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.5).strokeColor(BORDER).stroke();
  y += 18;

  // ── Product Specs ──
  y = sectionLabel(doc, 'Product Specs', y);
  y = drawFieldGrid(doc, [
    { label: 'Metal Type', value: order.metalType || '—' },
    { label: 'Metal Color', value: order.metalColor || '—' },
    { label: 'Size', value: order.size || '—' },
    { label: 'Quantity', value: String(order.quantity || 1) },
    { label: 'Stamping', value: order.stamping || '—' },
    { label: 'Diamond Type', value: order.diamondType || '—' },
    { label: 'Diamond Quality', value: order.diamondQuality || '—' },
    { label: 'Mounting Option', value: order.mountingOption || '—' },
    { label: 'Stone Shape', value: order.centerStoneShape || '—' },
    { label: 'Carat Weight', value: order.approximateCaratWeight ? `${order.approximateCaratWeight} ct` : '—' },
  ], y);

  // ── Mounting Only / Semi-Mount callout — flagged so Factory/Stone don't
  // expect a full stone-setting job on this order ──
  if (order.mountingOption) {
    y += 8;
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 26, 4).fillAndStroke(NOTE_BG, NOTE_BORDER);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NOTE_LABEL)
      .text(`⚠ ${order.mountingOption.toUpperCase()}`, MARGIN + 12, y + 8, { characterSpacing: 0.4 });
    y += 34;
  }

  // ── Special Instructions ──
  if (order.customerNotes) {
    y += 8;
    const noteWidth = CONTENT_WIDTH - 24;
    doc.font('Helvetica').fontSize(10);
    const noteTextHeight = doc.heightOfString(order.customerNotes, { width: noteWidth });
    const boxHeight = noteTextHeight + 34;
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, boxHeight, 4).fillAndStroke(NOTE_BG, NOTE_BORDER);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(NOTE_LABEL)
      .text('SPECIAL INSTRUCTIONS', MARGIN + 12, y + 10, { characterSpacing: 0.6 });
    doc.font('Helvetica').fontSize(10).fillColor(NOTE_TEXT)
      .text(order.customerNotes, MARGIN + 12, y + 22, { width: noteWidth });
    y += boxHeight + 16;
  } else {
    y += 16;
  }

  // ── Footer ── pinned near the bottom of whichever page is last; must stay
  // clear of pdfkit's implicit bottom margin or .text() auto-paginates instead
  // of drawing where told.
  const footerY = doc.page.height - MARGIN - 16;
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text('Generated automatically on VPO issue — Kira Jewels', MARGIN, footerY, { width: CONTENT_WIDTH / 2, lineBreak: false });
  doc.text('kirajewels.one', MARGIN, footerY, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });

  doc.end();
  return done;
}
