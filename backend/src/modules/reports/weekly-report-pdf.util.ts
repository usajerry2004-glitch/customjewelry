// Plain require, not a typed import: without esModuleInterop, `import
// PDFDocument from 'pdfkit'` resolves to the module's `.default`, which
// doesn't exist on pdfkit's CJS export.
const PDFDocument = require('pdfkit');
import { formatMoney } from '../../common/format-money.util';

export interface DesignerStat {
  name: string;
  submitted: number;
  approved: number;
  avgTurnaroundMs: number | null;
}

export interface TopCustomer {
  name: string;
  orders: number;
  value: number;
  onTimePct: number | null;
  orderDetails: { poNumber: string; orderType: string | null; value: number }[];
}

export interface WeeklyStats {
  weekStart: Date;
  weekEnd: Date;
  ordersReceived: number;
  ordersReceivedPctChange: number | null;
  cadsApproved: number;
  cadsApprovedPctChange: number | null;
  cadsRevised: number;
  cadsRevisedPctChange: number | null;
  avgCadTurnaroundMs: number | null;
  avgCadTurnaroundDirection: 'faster' | 'slower' | 'flat';
  shippedOnTimePct: number | null;
  shippedOnTimeDeltaPts: number | null;
  designers: DesignerStat[];
  stageDays: { cadDesign: number | null; assignSupplier: number | null; manufacturing: number | null; shipping: number | null };
  manufacturingLimitDays: number;
  manufacturingOverdueDays: number | null;
  slowestFactory: { name: string; avgDays: number } | null;
  topCustomers: TopCustomer[];
  leadCustomerName: string | null;
  leadCustomerOrders: number | null;
}

const NAVY = '#1A2740';
const GOLD = '#C09B58';
const CREAM = '#F5F4F0';
const BORDER = '#E8E4DC';
const MUTED = '#9CA3AF';
const TEXT2 = '#6B7280';
const GOOD = '#059669';
const SLOW = '#DC2626';
const AMBER = '#D97706';
const TRACK = '#EEEBE4';

const MARGIN = 40;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const totalHours = ms / (1000 * 60 * 60);
  const days = Math.floor(totalHours / 24);
  const hours = Math.round(totalHours % 24);
  if (days === 0) return `${hours}h`;
  return `${days}d ${hours}h`;
}

function formatDays(days: number | null): string {
  return days === null ? '—' : `${days.toFixed(1)}d`;
}

function factoryLabel(factory: string | null | undefined): string {
  if (!factory) return '—';
  return factory.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
}

// Plain-language summary — no jargon, filled in from the real numbers.
function buildGlanceText(s: WeeklyStats): string {
  const parts: string[] = [];

  let orderLine = `${s.ordersReceived} new orders came in this week`;
  if (s.ordersReceivedPctChange !== null) {
    orderLine += `, ${s.ordersReceivedPctChange >= 0 ? 'up' : 'down'} ${Math.abs(s.ordersReceivedPctChange)}%`;
  }
  if (s.leadCustomerName) {
    orderLine += `, led by ${s.leadCustomerName} (${s.leadCustomerOrders} order${s.leadCustomerOrders === 1 ? '' : 's'})`;
  }
  parts.push(orderLine + '.');

  let cadLine = `The CAD team approved ${s.cadsApproved} design${s.cadsApproved === 1 ? '' : 's'}, sent ${s.cadsRevised} back for changes`;
  if (s.avgCadTurnaroundDirection !== 'flat' && s.avgCadTurnaroundMs !== null) {
    cadLine += `, taking a bit ${s.avgCadTurnaroundDirection} per design at ${formatDuration(s.avgCadTurnaroundMs)}`;
  }
  parts.push(cadLine + '.');

  if (s.manufacturingOverdueDays !== null && s.manufacturingOverdueDays > 0) {
    parts.push(`The real problem is manufacturing — orders are taking ${formatDays(s.stageDays.manufacturing)} on average, over the ${s.manufacturingLimitDays}-day limit.`);
  } else if (s.stageDays.manufacturing !== null) {
    parts.push(`Manufacturing is on track at ${formatDays(s.stageDays.manufacturing)}, within the ${s.manufacturingLimitDays}-day limit.`);
  }

  if (s.shippedOnTimePct !== null) {
    let shipLine = `Shipping on time held at ${s.shippedOnTimePct}%`;
    if (s.shippedOnTimeDeltaPts !== null && Math.abs(s.shippedOnTimeDeltaPts) >= 2) {
      shipLine += ` (${s.shippedOnTimeDeltaPts >= 0 ? 'up' : 'down'} ${Math.abs(s.shippedOnTimeDeltaPts)} points)`;
    }
    parts.push(shipLine + '.');
  }

  return parts.join(' ');
}

function drawTile(doc: PDFKit.PDFDocument, x: number, y: number, w: number, value: string, label: string, trendText: string | null, trendColor: string) {
  doc.roundedRect(x, y, w, 62, 6).lineWidth(1).strokeColor(BORDER).stroke();
  doc.font('Helvetica-Bold').fontSize(17).fillColor(NAVY).text(value, x, y + 9, { width: w, align: 'center' });
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    .text(label.toUpperCase(), x + 4, y + 31, { width: w - 8, align: 'center', characterSpacing: 0.2 });
  if (trendText) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(trendColor).text(trendText, x, y + 47, { width: w, align: 'center' });
  }
}

// PDFKit's built-in Helvetica font only supports WinAnsi-encoded glyphs —
// ▲/▼ aren't in that set and render as garbage, so +/- stand in for them.
function trendInfo(pct: number | null, invert = false): { text: string; color: string } {
  if (pct === null) return { text: '—', color: TEXT2 };
  const good = invert ? pct <= 0 : pct >= 0;
  const sign = pct === 0 ? '—' : pct > 0 ? '+' : '-';
  return { text: `${sign}${Math.abs(pct)}%`, color: pct === 0 ? TEXT2 : good ? GOOD : SLOW };
}

export async function buildWeeklyReportPdf(s: WeeklyStats): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // ── Header band ──
  doc.rect(0, 0, PAGE_WIDTH, 92).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(GOLD).text('KIRA CUSTOM JEWELRY', MARGIN, 24);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').fillOpacity(0.45)
    .text('ORDER MANAGEMENT PLATFORM', MARGIN, 43, { characterSpacing: 1.2 });
  doc.fillOpacity(1);

  const range = `${s.weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${s.weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF').text(range, MARGIN, 24, { width: CONTENT_WIDTH, align: 'right' });
  const generated = new Date();
  const generatedText = `Generated ${generated.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${generated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  doc.font('Helvetica').fontSize(8.5).fillColor('#FFFFFF').fillOpacity(0.55)
    .text(generatedText, MARGIN, 39, { width: CONTENT_WIDTH, align: 'right' });
  doc.fillOpacity(1);

  doc.font('Helvetica-Bold').fontSize(19).fillColor('#FFFFFF').text('Weekly Operations Report', MARGIN, 60);

  let y = 112;

  // ── At a glance ──
  const glanceText = buildGlanceText(s);
  doc.font('Helvetica').fontSize(10.5);
  const glanceTextHeight = doc.heightOfString(glanceText, { width: CONTENT_WIDTH - 28 });
  const glanceBoxHeight = glanceTextHeight + 40;
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, glanceBoxHeight, 6).fillAndStroke(CREAM, BORDER);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD).text('THIS WEEK AT A GLANCE', MARGIN + 14, y + 12, { characterSpacing: 1 });
  doc.font('Helvetica').fontSize(10.5).fillColor(NAVY).text(glanceText, MARGIN + 14, y + 26, { width: CONTENT_WIDTH - 28, lineGap: 3 });
  y += glanceBoxHeight + 20;

  // ── KPI tiles ──
  const tileGap = 8;
  const tileW = (CONTENT_WIDTH - tileGap * 4) / 5;
  const ordersTrend = trendInfo(s.ordersReceivedPctChange);
  const cadsApprovedTrend = trendInfo(s.cadsApprovedPctChange);
  const cadsRevisedTrend = trendInfo(s.cadsRevisedPctChange, true);
  const turnaroundTrend = s.avgCadTurnaroundDirection === 'flat'
    ? { text: '— flat', color: TEXT2 }
    : { text: s.avgCadTurnaroundDirection, color: s.avgCadTurnaroundDirection === 'slower' ? SLOW : GOOD };
  const onTimeTrend = s.shippedOnTimeDeltaPts === null || Math.abs(s.shippedOnTimeDeltaPts) < 2
    ? { text: '— flat', color: TEXT2 }
    : { text: `${s.shippedOnTimeDeltaPts > 0 ? '+' : '-'}${Math.abs(s.shippedOnTimeDeltaPts)}pt`, color: s.shippedOnTimeDeltaPts > 0 ? GOOD : SLOW };

  drawTile(doc, MARGIN, y, tileW, String(s.ordersReceived), 'Orders Received', ordersTrend.text, ordersTrend.color);
  drawTile(doc, MARGIN + (tileW + tileGap), y, tileW, String(s.cadsApproved), 'CADs Approved', cadsApprovedTrend.text, cadsApprovedTrend.color);
  drawTile(doc, MARGIN + (tileW + tileGap) * 2, y, tileW, String(s.cadsRevised), 'CADs Revised', cadsRevisedTrend.text, cadsRevisedTrend.color);
  drawTile(doc, MARGIN + (tileW + tileGap) * 3, y, tileW, formatDuration(s.avgCadTurnaroundMs), 'CAD Time', turnaroundTrend.text, turnaroundTrend.color);
  drawTile(doc, MARGIN + (tileW + tileGap) * 4, y, tileW, s.shippedOnTimePct === null ? '—' : `${s.shippedOnTimePct}%`, 'Shipped On Time', onTimeTrend.text, onTimeTrend.color);
  y += 62 + 26;

  // ── Two columns: CAD team / Avg days per stage ──
  const colGap = 22;
  const colW = (CONTENT_WIDTH - colGap) / 2;
  const colLeftX = MARGIN;
  const colRightX = MARGIN + colW + colGap;
  const colTopY = y;

  // Left: CAD team approval rate
  //
  // This report has a fixed single-page layout — nothing here calls
  // doc.addPage() or accounts for overflow. Both loops below render every
  // entry in s.designers, so a week with a long tail of designers (name
  // variants, one-off submitters) pushes leftY past the page bottom. PDFKit
  // then silently starts a new page per remaining .text() call — since each
  // call passes its own explicit (already-overflowed) y, every field of every
  // remaining row lands on its own near-blank page. Capping the rendered
  // list keeps leftY inside the single page this layout was built for.
  const MAX_DESIGNERS_SHOWN = 8;
  const shownDesigners = s.designers.slice(0, MAX_DESIGNERS_SHOWN);
  const hiddenDesignerCount = s.designers.length - shownDesigners.length;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('CAD TEAM — APPROVAL RATE', colLeftX, y, { characterSpacing: 0.8 });
  doc.moveTo(colLeftX, y + 14).lineTo(colLeftX + colW, y + 14).lineWidth(0.75).strokeColor(BORDER).stroke();
  let leftY = y + 22;
  if (!shownDesigners.length) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No CAD submissions this week.', colLeftX, leftY);
    leftY += 18;
  }
  for (const d of shownDesigners) {
    const pct = d.submitted ? Math.round((d.approved / d.submitted) * 100) : 0;
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY).text(d.name, colLeftX, leftY, { continued: false });
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT2)
      .text(`${d.approved}/${d.submitted}`, colLeftX, leftY, { width: colW - 42, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY)
      .text(`${pct}%`, colLeftX + colW - 34, leftY, { width: 34, align: 'right' });
    leftY += 15;
    doc.roundedRect(colLeftX, leftY, colW, 7, 3.5).fill(TRACK);
    doc.roundedRect(colLeftX, leftY, colW * Math.max(pct, 3) / 100, 7, 3.5).fill(pct >= 75 ? GOOD : pct >= 50 ? AMBER : SLOW);
    leftY += 17;
  }

  leftY += 4;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text('DESIGNER', colLeftX, leftY);
  doc.text('SUBMITTED', colLeftX, leftY, { width: colW - 55, align: 'right' });
  doc.text('AVG TIME', colLeftX + colW - 50, leftY, { width: 50, align: 'right' });
  leftY += 12;
  doc.moveTo(colLeftX, leftY).lineTo(colLeftX + colW, leftY).lineWidth(0.5).strokeColor(BORDER).stroke();
  leftY += 6;
  for (const d of shownDesigners) {
    doc.font('Helvetica').fontSize(9.5).fillColor(NAVY).text(d.name, colLeftX, leftY);
    doc.text(String(d.submitted), colLeftX, leftY, { width: colW - 55, align: 'right' });
    doc.text(formatDuration(d.avgTurnaroundMs), colLeftX + colW - 50, leftY, { width: 50, align: 'right' });
    leftY += 14;
  }
  if (hiddenDesignerCount > 0) {
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text(`+${hiddenDesignerCount} more designer${hiddenDesignerCount === 1 ? '' : 's'} this week — see the dashboard for the full breakdown.`, colLeftX, leftY, { width: colW });
    leftY += 14;
  }

  // Right: Avg days per stage
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('AVG DAYS PER STAGE', colRightX, colTopY, { characterSpacing: 0.8 });
  doc.moveTo(colRightX, colTopY + 14).lineTo(colRightX + colW, colTopY + 14).lineWidth(0.75).strokeColor(BORDER).stroke();
  let rightY = colTopY + 22;

  const stageRows: { label: string; value: number | null }[] = [
    { label: 'CAD Design', value: s.stageDays.cadDesign },
    { label: 'Assign Supplier', value: s.stageDays.assignSupplier },
    { label: 'Manufacturing', value: s.stageDays.manufacturing },
    { label: 'Shipping', value: s.stageDays.shipping },
  ];
  const maxStageVal = Math.max(1, ...stageRows.map(r => r.value || 0));
  const isOverdue = s.manufacturingOverdueDays !== null && s.manufacturingOverdueDays > 0;

  for (const row of stageRows) {
    const isManufacturing = row.label === 'Manufacturing';
    doc.font('Helvetica').fontSize(10.5).fillColor(NAVY).text(row.label, colRightX, rightY, { continued: false });
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY).text(formatDays(row.value), colRightX, rightY, { width: colW, align: 'right' });
    rightY += 15;
    const fillW = colW * Math.min(1, (row.value || 0) / maxStageVal);
    doc.roundedRect(colRightX, rightY, colW, 7, 3.5).fill(TRACK);
    doc.roundedRect(colRightX, rightY, Math.max(fillW, 3), 7, 3.5).fill(isManufacturing && isOverdue ? SLOW : GOLD);
    if (isManufacturing) {
      const thresholdX = colRightX + colW * Math.min(1, s.manufacturingLimitDays / maxStageVal);
      doc.moveTo(thresholdX, rightY - 2).lineTo(thresholdX, rightY + 9).lineWidth(1.5).strokeColor(NAVY).stroke();
      doc.font('Helvetica').fontSize(6.5).fillColor(TEXT2).text(`${s.manufacturingLimitDays}d limit`, thresholdX - 16, rightY + 10);
    }
    rightY += isManufacturing ? 22 : 17;
    if (isManufacturing) {
      doc.font('Helvetica-Bold').fontSize(7).fillColor(SLOW)
        .text('SLOWEST', colRightX, rightY - 8, { continued: false });
      if (isOverdue) {
        doc.fillColor('#FFFFFF');
        const tagText = `OVERDUE +${s.manufacturingOverdueDays!.toFixed(1)}d`;
        const tagW = doc.widthOfString(tagText) + 12;
        doc.roundedRect(colRightX + 52, rightY - 15, tagW, 12, 3).fill(SLOW);
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#FFFFFF').text(tagText, colRightX + 58, rightY - 12);
      }
      rightY += 8;
    }
  }

  if (s.slowestFactory) {
    rightY += 6;
    const overdueText = s.slowestFactory.avgDays > s.manufacturingLimitDays
      ? ` — ${(s.slowestFactory.avgDays - s.manufacturingLimitDays).toFixed(1)} days over the ${s.manufacturingLimitDays}-day limit`
      : '';
    const detailText = `${s.slowestFactory.avgDays.toFixed(1)} days average${overdueText}. Slowest factory this week.`;
    doc.font('Helvetica').fontSize(9.5);
    const detailHeight = doc.heightOfString(detailText, { width: colW - 24 });
    const boxHeight = detailHeight + 34;
    doc.roundedRect(colRightX, rightY, colW, boxHeight, 6).fillAndStroke('#FEF3C7', '#FCD34D');
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#92400E').text(factoryLabel(s.slowestFactory.name), colRightX + 12, rightY + 9);
    doc.font('Helvetica').fontSize(9.5).fillColor('#92400E').text(detailText, colRightX + 12, rightY + 22, { width: colW - 24, lineGap: 1 });
    rightY += boxHeight;
  }

  y = Math.max(leftY, rightY) + 20;

  // This section now lists every customer with an order this week (not just
  // the top 3) plus every individual order under each — for a busy week that
  // can run to several pages, so unlike the fixed single-page layout above,
  // it manages its own page breaks rather than assuming everything fits.
  const pageBottom = doc.page.height - MARGIN;
  const custCols = [
    { label: 'CUSTOMER', w: CONTENT_WIDTH - 260, align: 'left' as const },
    { label: 'ORDERS', w: 80, align: 'right' as const },
    { label: 'VALUE', w: 90, align: 'right' as const },
    { label: 'ON TIME', w: 90, align: 'right' as const },
  ];

  function drawCustomerTableHeader() {
    let hx = MARGIN;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
    for (const col of custCols) {
      doc.text(col.label, hx, y, { width: col.w, align: col.align, characterSpacing: 0.4 });
      hx += col.w;
    }
    y += 12;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(0.75).strokeColor(BORDER).stroke();
    y += 8;
  }

  // Starts a fresh page if `needed` more points of room aren't left, with no
  // other side effect — used once, up front, before anything has been drawn
  // yet so there's no running header to continue.
  function pageBreakIfNeeded(needed: number): boolean {
    if (y + needed <= pageBottom) return false;
    doc.addPage();
    y = MARGIN;
    return true;
  }

  // Same, but re-draws the running column header for continuity — for use
  // once the table's already underway, so a mid-list break doesn't leave a
  // page of rows with no header above them.
  function ensureRoom(needed: number) {
    if (pageBreakIfNeeded(needed)) drawCustomerTableHeader();
  }

  pageBreakIfNeeded(18 + 12 + 8 + 16);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('CUSTOMERS THIS WEEK', MARGIN, y, { characterSpacing: 0.8 });
  y += 18;
  drawCustomerTableHeader();

  if (!s.topCustomers.length) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('No orders this week.', MARGIN, y);
    y += 16;
  }
  for (const c of s.topCustomers) {
    const blockHeight = 16 + c.orderDetails.length * 13;
    ensureRoom(blockHeight);

    let cx = MARGIN;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(c.name, cx, y, { width: custCols[0].w });
    cx += custCols[0].w;
    doc.font('Helvetica').fontSize(10).fillColor(NAVY).text(String(c.orders), cx, y, { width: custCols[1].w, align: 'right' });
    cx += custCols[1].w;
    doc.text(formatMoney(c.value), cx, y, { width: custCols[2].w, align: 'right' });
    cx += custCols[2].w;
    const onTimeColor = c.onTimePct === null ? TEXT2 : c.onTimePct >= 90 ? GOOD : AMBER;
    doc.fillColor(onTimeColor).text(c.onTimePct === null ? '—' : `${c.onTimePct}%`, cx, y, { width: custCols[3].w, align: 'right' });
    y += 16;

    // Order-level detail, indented under the customer — same idea as the
    // summary row but one line per order, in a smaller muted style.
    for (const o of c.orderDetails) {
      ensureRoom(13);
      doc.font('Helvetica').fontSize(8.5).fillColor(TEXT2)
        .text(o.poNumber, MARGIN + 14, y, { width: custCols[0].w - 14 });
      doc.text(o.orderType || '—', MARGIN + 14 + 90, y, { width: custCols[0].w - 14 - 90 });
      doc.text(formatMoney(o.value), MARGIN + custCols[0].w, y, { width: custCols[1].w + custCols[2].w, align: 'right' });
      y += 13;
    }

    doc.moveTo(MARGIN, y - 3).lineTo(MARGIN + CONTENT_WIDTH, y - 3).lineWidth(0.5).strokeColor('#F3F1EC').stroke();
  }

  // ── Footer ── kept clear of pdfkit's implicit bottom margin (see
  // factory-order-pdf.util.ts for why this matters) or .text() auto-paginates.
  const footerY = doc.page.height - MARGIN - 16;
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text('Kira Custom Jewelry · Order Management Platform', MARGIN, footerY, { width: CONTENT_WIDTH / 2, lineBreak: false });
  doc.text('Sent as a PDF attachment every Monday · Not published to the portal', MARGIN, footerY, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });

  doc.end();
  return done;
}
