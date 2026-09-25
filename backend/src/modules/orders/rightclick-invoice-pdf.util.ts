import { join } from 'path';
import { Order } from '../../database/entities/order.entity';
import { RightClickCustomerOrder, RightClickLineItem } from './rightclick.service';

// Plain require, not a typed import — see factory-order-pdf.util.ts for why.
const PDFDocument = require('pdfkit');

// Navy-on-white "KIRA" wordmark, for this PDF's white background (the one in
// frontend/public/logo.png is white-on-transparent, meant for the dark
// sidebar). Copied into dist/ on build via the "assets" glob in
// nest-cli.json, not compiled by tsc, so it's loaded by plain filesystem
// path relative to this file at runtime.
const LOGO_PATH = join(__dirname, 'assets', 'kira-logo.png');

// Matches the layout of Kira Jewels' real RightClick-generated invoices
// (samples supplied by the business — see chat history) as closely as
// pdfkit reasonably allows. Known, deliberate differences from the real
// RightClick invoice, all because the underlying data doesn't exist in
// JewelFlow: no barcode, no embedded logo image (text wordmark instead), no
// "Memo #"/"Weight" columns (always blank on every real sample anyway), and
// a JewelFlow-generated footer credit instead of RightClick's own copyright
// line. Ship Via and Terms are picked by the admin at generate time (see the
// modal on the order detail page) since JewelFlow doesn't track either
// per-order.
const INK = '#1A1A1A';
const MUTED = '#6B7280';
const FAINT = '#9CA3AF';
const BORDER = '#D1D5DB';
const HEADER_BG = '#F3F4F6';

const MARGIN = 36;
const PAGE_WIDTH = 595.28; // A4 pt
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Static company letterhead — identical on every invoice, not derived from
// order data.
const COMPANY_NAME = 'Kira Jewels Inc (Jewelry)';
const COMPANY_ADDRESS_LINES = ['535 FIFTH AVE, 17FL', 'New York NY 10017 USA'];
const COMPANY_PHONE = '646-346-6610';
const COMPANY_EMAIL = 'Ac-Usa@kirajewels.one';

// Static wire details — printed on every real Kira Jewels invoice already,
// so reproducing them here isn't exposing anything not already customer-facing.
const BANK_NAME = 'Metropolitan Commercial Bank, 99 Park Ave, New York, NY10016';
const BANK_BENEFICIARY = 'Kira Jewels Inc';
const BANK_ACCOUNT = '0399028846';
const BANK_ROUTING = '026013356';
const BANK_SWIFT = 'MCBEUS33';

// Admin-selected at generate time (see the modal on the order detail page)
// — kept here as the single source of truth for the option lists; the
// frontend hardcodes a matching copy since it can't import from the backend.
export const SHIP_VIA_OPTIONS = ['FedEx', 'FedEx Overnight', 'Pickup'] as const;
export const TERMS_OPTIONS = [
  'Cash On Delivery', 'Advance', 'Received Payment',
  '5 days', '7 days', '15 days', '30 days', '45 days', '60 days', '90 days', '120 days', '180 days', '210 days',
] as const;

// "30 days" -> "Net 030 Days", matching the real invoices' formatting;
// non-day terms (Cash On Delivery, Advance, Received Payment) print as-is.
function formatTermsLabel(terms: string): string {
  const match = /^(\d+)\s*days$/i.exec(terms.trim());
  if (!match) return terms;
  return `Net ${match[1].padStart(3, '0')} Days`;
}

// Day-based terms push the due date out that many days; the immediate-
// settlement terms (COD/Advance/Received Payment) have no "later" due date,
// so it's just the issue date.
function computeDueDate(issueDate: Date, terms: string): Date {
  const match = /^(\d+)\s*days$/i.exec(terms.trim());
  if (!match) return issueDate;
  return new Date(issueDate.getTime() + parseInt(match[1], 10) * 24 * 60 * 60 * 1000);
}

function money(v: number): string {
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseMoney(v: string | number | null | undefined): number {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n === null || n === undefined || Number.isNaN(n) ? 0 : n;
}

interface AddressBlock {
  name: string;
  lines: string[];
}

function addressFromRightClick(c: RightClickCustomerOrder['customer']): AddressBlock | null {
  if (!c) return null;
  const name = c.company || c.name || '—';
  const lines = [
    c.company && c.name ? c.name : null,
    [c.address1, c.address2].filter(Boolean).join(', ') || null,
    [c.city, c.state, c.zip].filter(Boolean).join(' ') || null,
    c.country || null,
  ].filter(Boolean) as string[];
  return { name, lines };
}

function addressFromOrder(order: Order): AddressBlock {
  const name = order.storeName || order.customerFullName || order.customerCodeName || '—';
  const lines = [order.customerEmail, order.phoneNumber].filter(Boolean) as string[];
  return { name, lines };
}

interface InvoiceLineItem {
  itemCode: string;
  customerItemCode: string;
  size: string;
  description: string;
  quantity: string;
  price: number;
  amount: number;
}

function buildLineItems(order: Order, rcOrder: RightClickCustomerOrder | null): InvoiceLineItem[] {
  const rcItems = rcOrder?.lineitems;
  if (rcItems && rcItems.length) {
    return rcItems.map((li: RightClickLineItem) => {
      const qty = li.quantity ?? 1;
      const price = parseMoney(li.price);
      const amount = li.amount !== undefined ? parseMoney(li.amount) : price * parseMoney(qty as any || 1);
      return {
        itemCode: li.itemcode || order.kiraSkuNumber || '—',
        customerItemCode: order.refCustomerPo || '—',
        size: order.size || '—',
        description: li.description || '—',
        quantity: String(qty),
        price,
        amount,
      };
    });
  }

  const specParts = [
    order.metalType && order.metalColor ? `${order.metalType} ${order.metalColor} Gold` : (order.metalType || order.metalColor),
    order.orderType,
    order.centerStoneShape && order.approximateCaratWeight ? `${order.centerStoneShape} ${order.approximateCaratWeight}ct` : (order.centerStoneShape || null),
    order.diamondType,
    order.diamondQuality,
  ].filter(Boolean).join(', ');

  return [{
    itemCode: order.kiraSkuNumber || '—',
    customerItemCode: order.refCustomerPo || '—',
    size: order.size || '—',
    description: specParts || order.orderType || 'Custom Jewelry',
    quantity: String(order.quantity ?? 1),
    price: parseMoney(order.quotedCost),
    amount: parseMoney(order.quotedCost),
  }];
}

function drawLabelValueCell(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, label: string, value: string) {
  doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label, x + 6, y + h / 2 - 5, { lineBreak: false });
  const labelWidth = doc.widthOfString(label);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK)
    .text(value, x + 6 + labelWidth + 3, y + h / 2 - 5, { width: w - labelWidth - 14, lineBreak: false });
}

function drawInfoGrid(doc: PDFKit.PDFDocument, rows: { label: string; value: string }[][], startY: number): number {
  const rowHeight = 20;
  let y = startY;
  for (const row of rows) {
    const cellWidth = CONTENT_WIDTH / row.length;
    row.forEach((cell, i) => drawLabelValueCell(doc, MARGIN + i * cellWidth, y, cellWidth, rowHeight, cell.label, cell.value));
    y += rowHeight;
  }
  return y;
}

function drawAddressBox(doc: PDFKit.PDFDocument, label: string, addr: AddressBlock, x: number, y: number, w: number): number {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK).text(label.toUpperCase(), x, y, { characterSpacing: 0.6 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(addr.name, x, y + 13, { width: w });
  let ly = y + 13 + doc.heightOfString(addr.name, { width: w }) + 2;
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  for (const line of addr.lines) {
    doc.text(line, x, ly, { width: w });
    ly += doc.heightOfString(line, { width: w }) + 1;
  }
  return ly;
}

const ITEMS_TABLE_COLS = [
  { key: '#', width: 18, align: 'left' as const },
  { key: 'Item #', width: 60, align: 'left' as const },
  { key: 'Cust Item #', width: 75, align: 'left' as const },
  { key: 'Size', width: 30, align: 'left' as const },
  { key: 'Description', width: CONTENT_WIDTH - 18 - 60 - 75 - 30 - 28 - 52 - 55, align: 'left' as const },
  { key: 'Qty', width: 28, align: 'right' as const },
  { key: 'Price', width: 52, align: 'right' as const },
  { key: 'Amount', width: 55, align: 'right' as const },
];

function itemsTableColX(): number[] {
  let x = MARGIN;
  const colX: number[] = [];
  for (const c of ITEMS_TABLE_COLS) { colX.push(x); x += c.width; }
  return colX;
}

function drawItemsTableHeader(doc: PDFKit.PDFDocument, colX: number[], y: number): number {
  doc.rect(MARGIN, y, CONTENT_WIDTH, 18).fill(HEADER_BG);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
  ITEMS_TABLE_COLS.forEach((c, i) => doc.text(c.key.toUpperCase(), colX[i] + 4, y + 5, { width: c.width - 8, align: c.align, characterSpacing: 0.3 }));
  y += 18;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(1).strokeColor(INK).stroke();
  return y;
}

// A large order can have many line items — enough to overflow a page. Rows
// are measured and, when one wouldn't fit, a new page is started (with the
// column header repeated) *before* drawing it, rather than letting a single
// row's cells land on whatever page pdfkit's own implicit auto-pagination
// happens to break to. Each cell in a row is a separate .text() call, so
// without this a too-tall row silently gets its columns scattered across
// several near-blank pages, one field per page.
const ITEMS_TABLE_BOTTOM_LIMIT = 24;

function drawItemsTable(doc: PDFKit.PDFDocument, items: InvoiceLineItem[], startY: number): number {
  const colX = itemsTableColX();
  let y = drawItemsTableHeader(doc, colX, startY);

  items.forEach((item, i) => {
    const values = [String(i + 1), item.itemCode, item.customerItemCode, item.size, item.description, item.quantity, money(item.price), money(item.amount)];
    doc.font('Helvetica').fontSize(8.5);
    const rowHeight = Math.max(doc.heightOfString(item.description, { width: ITEMS_TABLE_COLS[4].width - 8 }) + 10, 22);

    if (y + rowHeight > doc.page.height - MARGIN - ITEMS_TABLE_BOTTOM_LIMIT) {
      doc.addPage();
      y = drawItemsTableHeader(doc, colX, MARGIN);
    }

    doc.fillColor(INK);
    values.forEach((v, ci) => {
      doc.font(ci === 7 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
        .text(v, colX[ci] + 4, y + 6, { width: ITEMS_TABLE_COLS[ci].width - 8, align: ITEMS_TABLE_COLS[ci].align });
    });
    y += rowHeight;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.5).strokeColor(BORDER).stroke();
  });

  return y + 12;
}

// Verbatim from the real RightClick-generated invoices (see chat history) —
// including their wording/capitalization/typos exactly ("In additiona:",
// "Duly Signed Be Authorized Person", "Mined Diamon.", no hyphens in
// "conflict free and ecology friendly", no trailing period after "(Russia)")
// since the business asked for this section reproduced exactly as-is, not
// cleaned up.
const LEGAL_CERTIFICATION = 'Certified that the particulars above are true and correct and the amount indicated represents the price actually charged and that there is no flow additional, Consideration directly or indirectly from the buyer or from any person on behalf of the buyer.';

const LEGAL_DISCLAIMER = "Kira Jewels Inc. Expressly Disclaims Any Obligation Or Liability For Any Fraudulent Email Or Verbal Communication For Any Payment Instructions. Please Send Us Payments As Per Payment Instructions Specified On Only Original Hard Copy Of Invoice Duly Signed Be Authorized Person. For Any other Expense, Loss Or Damage Of Whatsoever Kind Of Nature, Whether Direct, Incidental Or Consequential In Connection With The Payment Is Not Liable To The Company.\n\nIn additiona: A) Our stones have undergone substantial transformation in India. B) Have not been obtained in violations with any applicable laws of sanctions currently issued by the US Dept of Treasury's Office of Foreign Assets Control (OFAC). And C) Have not been processed from rough diamonds originating from the Russian Federation (Russia)";

const LEGAL_DECLARATION = 'We hereby Declare that all the goods mentioned in this invoice are Laboratory Grown Diamonds / Man-Made Diamonds. All Metals used are recycled Metals. Buyer also agrees explicitly to sell them as Laboratory Grown Diamonds / Man-Made Diamonds, by making full and clear disclosure in their invoice to their customers.\n\ni. The goods mentioned in this invoice are not natural diamonds / Mined Diamon. These diamonds are Laboratory Grown. ii. The origins of these diamonds are conflict free and ecology friendly environment. iii. A finance charge of 2% per month(24% APR ) will be applied to all past due account balances. By accepting the goods, the purchaser agrees to pay all costs of collecting including attorney fees.';

// The legal block's content is fixed-length (same hardcoded text on every
// invoice), so its height can be measured up front without drawing it —
// heightOfString doesn't move doc.y or emit anything. Used to pin the block
// near the bottom of the page, matching the real RightClick invoices (where
// it sits just above the footer with a big gap above it, not immediately
// under the line items table).
function measureLegalBlockHeight(doc: PDFKit.PDFDocument, width: number): number {
  doc.font('Helvetica-Oblique').fontSize(4.5);
  let h = doc.heightOfString(LEGAL_CERTIFICATION, { width });
  doc.font('Helvetica-Bold').fontSize(5);
  h += 6 + doc.heightOfString('DISCLAIMER:', { width });
  doc.font('Helvetica').fontSize(4.5);
  h += 2 + doc.heightOfString(LEGAL_DISCLAIMER, { width });
  doc.font('Helvetica-Bold').fontSize(5);
  h += 8 + doc.heightOfString('DECLARATION:', { width });
  doc.font('Helvetica').fontSize(4.5);
  h += 2 + doc.heightOfString(LEGAL_DECLARATION, { width });
  doc.font('Helvetica-Bold').fontSize(5);
  h += 8 + doc.heightOfString('BANK DETAILS:', { width });
  doc.font('Helvetica').fontSize(4.5);
  h += 2 + doc.heightOfString(BANK_NAME, { width });
  h += 1 + doc.heightOfString(`Beneficiary: ${BANK_BENEFICIARY}, Account No # : ${BANK_ACCOUNT}, Routing (ABA) # ${BANK_ROUTING}, Swift Code # : ${BANK_SWIFT}`, { width });
  return h;
}

function drawTotalsBox(doc: PDFKit.PDFDocument, totals: { subtotal: number; otherCharges: number; shipping: number; discount: number; tax: number; grandTotal: number }, x: number, y: number, w: number): number {
  const rows: [string, number][] = [
    ['Subtotal:', totals.subtotal],
    ['Other Charges:', totals.otherCharges],
    ['Shipping:', totals.shipping],
    ['Discount:', totals.discount ? -totals.discount : 0],
    ['Tax:', totals.tax],
  ];
  let ly = y;
  rows.forEach(([label, value]) => {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, x, ly, { width: w * 0.55, align: 'left' });
    doc.font('Helvetica').fontSize(9).fillColor(INK).text(money(value), x + w * 0.55, ly, { width: w * 0.45, align: 'right' });
    ly += 14;
  });
  ly += 6;
  doc.moveTo(x, ly).lineTo(x + w, ly).lineWidth(0.75).strokeColor(INK).stroke();
  ly += 8;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('Grand Total:', x, ly, { width: w * 0.55, align: 'left' });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(money(totals.grandTotal), x + w * 0.55, ly, { width: w * 0.45, align: 'right' });
  return ly + 20;
}

export interface InvoiceCharges {
  otherCharges: number;
  shipping: number;
  discount: number;
  tax: number;
}

export async function buildRightClickInvoicePdf(order: Order, invoiceNumber: string, rcOrder: RightClickCustomerOrder | null, shipVia: string, terms: string, charges: InvoiceCharges): Promise<Buffer> {
  // bufferPages lets the accurate page count (only known once every line
  // item — and any pagination it triggers — has been drawn) be written back
  // onto page 1's "Page #: 1 of N" afterward, instead of only ever being
  // able to claim "1 of 1".
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // ── Header: logo wordmark + company letterhead (left), Invoice title + number (right) ──
  doc.image(LOGO_PATH, MARGIN, MARGIN, { height: 32 });

  const companyX = MARGIN + 110;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(COMPANY_NAME, companyX, MARGIN);
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  let cy = MARGIN + 13;
  for (const line of COMPANY_ADDRESS_LINES) { doc.text(line, companyX, cy); cy += 11; }
  doc.text(COMPANY_PHONE, companyX, cy); cy += 11;
  doc.text(COMPANY_EMAIL, companyX, cy);

  doc.font('Helvetica').fontSize(26).fillColor(INK).text('Invoice', MARGIN, MARGIN, { width: CONTENT_WIDTH, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(INK)
    .text(`Invoice #: ${invoiceNumber}`, MARGIN, MARGIN + 34, { width: CONTENT_WIDTH, align: 'right' });
  // "Page #: 1 of N" is filled in once the true page count is known — see
  // the bufferedPageRange() call right before doc.end() below.

  let y = MARGIN + 72;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(1).strokeColor(INK).stroke();
  y += 16;

  // ── Invoice To / Ship To ── RightClick's own record when this order
  // resolved to one there (fuller, structured address); otherwise whatever
  // contact info JewelFlow itself has for the order.
  const billTo = addressFromRightClick(rcOrder?.customer) || addressFromOrder(order);
  const shipTo = addressFromRightClick(rcOrder?.shipto) || addressFromRightClick(rcOrder?.customer) || addressFromOrder(order);
  const colW = (CONTENT_WIDTH - 24) / 2;
  const y1 = drawAddressBox(doc, 'Invoice To', billTo, MARGIN, y, colW);
  const y2 = drawAddressBox(doc, 'Ship To', shipTo, MARGIN + colW + 24, y, colW);
  y = Math.max(y1, y2) + 14;

  // ── Info grid ──
  const issueDate = new Date();
  const dueDate = computeDueDate(issueDate, terms);
  const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

  y = drawInfoGrid(doc, [
    [
      { label: 'P.O. #:', value: order.poNumber || '—' },
      { label: 'Customer #:', value: order.customerCode || '—' },
      { label: 'Date:', value: fmtDate(issueDate) },
      { label: 'Due Date:', value: fmtDate(dueDate) },
      { label: 'Terms:', value: formatTermsLabel(terms) },
    ],
    [
      { label: 'Type:', value: 'Custom' },
      { label: 'Salesperson:', value: order.salesRepName || '—' },
      { label: 'Phone #:', value: rcOrder?.customer?.phone || order.phoneNumber || '—' },
      { label: 'Ship Via:', value: shipVia || '—' },
    ],
  ], y);
  y += 14;

  // ── Line items ──
  const items = buildLineItems(order, rcOrder);
  y = drawItemsTable(doc, items, y);

  const subtotal = items.reduce((s, it) => s + it.amount, 0);
  const grandTotal = subtotal + charges.otherCharges + charges.shipping - charges.discount + charges.tax;
  const totals = { subtotal, ...charges, grandTotal };

  // ── Legal text (left) + totals/signature (right), side by side ── pinned
  // near the bottom of the page, just above the footer, with the gap above
  // it left blank — matching the real RightClick invoices, which don't flow
  // this block immediately under the line items table either. Falls back to
  // flowing right after the table when there isn't enough room (many line
  // items), rather than overlapping the footer.
  const legalX = MARGIN;
  const legalW = CONTENT_WIDTH * 0.6;
  const totalsX = MARGIN + legalW + 20;
  const totalsW = CONTENT_WIDTH - legalW - 20;

  const footerReserve = 40;
  const legalBlockHeight = measureLegalBlockHeight(doc, legalW);
  const bottomAnchoredY = doc.page.height - MARGIN - footerReserve - legalBlockHeight;
  let legalStartY = Math.max(y + 20, bottomAnchoredY);
  // A long items table can leave too little room on its last page for the
  // whole legal block to fit before the footer — same risk of fragmenting
  // text across pdfkit's own implicit page breaks as the items table had.
  // Starting a fresh page for it here avoids that outright.
  if (legalStartY + legalBlockHeight > doc.page.height - MARGIN - footerReserve) {
    doc.addPage();
    legalStartY = MARGIN;
  }
  y = legalStartY;

  doc.font('Helvetica-Oblique').fontSize(4.5).fillColor(INK).text(LEGAL_CERTIFICATION, legalX, y, { width: legalW });
  y = legalX === MARGIN ? doc.y + 6 : doc.y;
  doc.font('Helvetica-Bold').fontSize(5).fillColor(INK).text('DISCLAIMER:', legalX, y, { width: legalW, underline: true });
  doc.font('Helvetica').fontSize(4.5).fillColor(INK).text(LEGAL_DISCLAIMER, legalX, doc.y + 2, { width: legalW });
  doc.font('Helvetica-Bold').fontSize(5).fillColor(INK).text('DECLARATION:', legalX, doc.y + 8, { width: legalW, underline: true });
  doc.font('Helvetica').fontSize(4.5).fillColor(INK).text(LEGAL_DECLARATION, legalX, doc.y + 2, { width: legalW });

  doc.font('Helvetica-Bold').fontSize(5).fillColor(INK).text('BANK DETAILS:', legalX, doc.y + 8, { width: legalW, continued: false, underline: true });
  doc.font('Helvetica').fontSize(4.5).fillColor(INK).text(BANK_NAME, legalX, doc.y + 2, { width: legalW });
  doc.text(`Beneficiary: ${BANK_BENEFICIARY}, Account No # : ${BANK_ACCOUNT}, Routing (ABA) # ${BANK_ROUTING}, Swift Code # : ${BANK_SWIFT}`, legalX, doc.y + 1, { width: legalW });
  const legalEndY = doc.y;

  const totalsEndY = drawTotalsBox(doc, totals, totalsX, legalStartY, totalsW);
  doc.font('Helvetica').fontSize(4.5).fillColor(INK).text('For Kira Jewels Inc . Agreed and Accepted by the Purchaser', totalsX, totalsEndY + 20, { width: totalsW });
  doc.text('Receipt of the goods also acknowledged by the purchaser', totalsX, doc.y + 1, { width: totalsW });
  doc.moveTo(totalsX, doc.y + 20).lineTo(totalsX + totalsW, doc.y + 20).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.font('Helvetica').fontSize(4.5).fillColor(INK).text('Authorized Signatory Company Chop & Signature', totalsX, doc.y + 24, { width: totalsW });

  if (!rcOrder) {
    doc.font('Helvetica-Oblique').fontSize(5).fillColor(INK)
      .text('Note: no matching order was found in RightClick for this order number — the figures above reflect JewelFlow\'s own order record only.', MARGIN, Math.max(legalEndY, doc.y) + 14, { width: CONTENT_WIDTH });
  }

  // ── Footer ──
  const footerY = doc.page.height - MARGIN - 12;
  doc.font('Helvetica').fontSize(7).fillColor(FAINT)
    .text('Generated by JewelFlow — Kira Jewels', MARGIN, footerY, { width: CONTENT_WIDTH / 2, lineBreak: false });
  doc.text('kirajewels.one', MARGIN, footerY, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });

  // Now that every page (including any added mid-table or before the legal
  // block) has actually been drawn, go back and fill in the real count.
  const pageRange = doc.bufferedPageRange();
  doc.switchToPage(pageRange.start);
  doc.font('Helvetica').fontSize(9).fillColor(INK)
    .text(`Page #: 1 of ${pageRange.count}`, MARGIN, MARGIN + 47, { width: CONTENT_WIDTH, align: 'right' });

  doc.end();
  return done;
}
