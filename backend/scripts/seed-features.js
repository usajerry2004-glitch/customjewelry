/**
 * Seed test data for all new features:
 * 1. SLA/Overdue orders  — orders stuck past their SLA limit (backdated via SQL)
 * 2. Manufacturing orders — in VPO/Job Bag stages for QR code testing
 * 3. Reports data        — orders in various statuses for the reports page
 * 4. Sample CSV file     — ready to drag-drop into the Import page
 * 5. CAD files awaiting  — old SENT_FOR_APPROVAL files for customer reminder testing
 *
 * Run: node scripts/seed-features.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

const BASE = 'http://localhost:4000/api/v1';

// ── Helpers ────────────────────────────────────────────────────────────────
function req(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const data   = body ? JSON.stringify(body) : null;
    const parsed = new URL(BASE + url);
    const opts   = {
      hostname: parsed.hostname, port: parsed.port,
      path: parsed.pathname + parsed.search, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data   ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function upload(url, filePath, originalName, notes, token) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const boundary = '----FormBoundary' + Date.now();
    let body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${originalName}"\r\nContent-Type: image/svg+xml\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="designerNotes"\r\n\r\n${notes || ''}\r\n--${boundary}--\r\n`),
    ]);
    const parsed = new URL(BASE + url);
    const r = http.request({
      hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length, Authorization: `Bearer ${token}` },
    }, res => { let buf = ''; res.on('data', c => buf += c); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, body: buf }); } }); });
    r.on('error', reject); r.write(body); r.end();
  });
}

// Simple SVG ring for CAD files
function cadSvg(label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <rect width="500" height="500" fill="#0a0e1a"/>
  <circle cx="250" cy="250" r="160" fill="none" stroke="#d0d8e8" stroke-width="22" opacity=".9"/>
  <circle cx="250" cy="90" r="44" fill="#d0d8e8"/>
  <polygon points="250,68 268,90 250,112 232,90" fill="#e8f4ff" opacity=".95"/>
  <text x="250" y="470" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="12">KIRA JEWELS · ${label}</text>
</svg>`;
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  // 1. Login
  console.log('Logging in...');
  const loginRes = await req('POST', '/auth/login', { email: 'admin@kirajewels.one', password: 'KiRa@Admin#2025!' });
  if (!loginRes.body.access_token) { console.error('Login failed:', loginRes.body); process.exit(1); }
  const token = loginRes.body.access_token;
  console.log('✅ Logged in\n');

  const cadDir = path.join(__dirname, '..', 'uploads', 'cad');
  fs.mkdirSync(cadDir, { recursive: true });

  const created = [];

  // ── GROUP 1: SLA/OVERDUE TEST ORDERS ─────────────────────────────────────
  console.log('=== GROUP 1: SLA/Overdue Orders (will be backdated) ===');
  const slaOrders = [
    { po: 'KJ-SLA-001', orderType: 'Engagement Ring', metalType: '18K', metalColor: 'White Gold', status: 'WAITING_CONFIRMATION', storeName: 'Prestige Diamonds', notes: 'SLA TEST: waiting confirmation for 3 days (limit 1d)' },
    { po: 'KJ-SLA-002', orderType: 'Necklace',        metalType: '14K', metalColor: 'Yellow Gold', status: 'PENDING_CAD',          storeName: 'Luxe Gems NYC',    notes: 'SLA TEST: pending CAD for 5 days (limit 3d)' },
    { po: 'KJ-SLA-003', orderType: 'Wedding Band',    metalType: 'Platinum', metalColor: 'Platinum', status: 'SKU_CREATION',      storeName: 'Golden Ring Co',   notes: 'SLA TEST: stuck in SKU creation for 4 days (limit 2d)' },
    { po: 'KJ-SLA-004', orderType: 'Earrings',        metalType: '18K', metalColor: 'Rose Gold', status: 'READY_TO_INVOICE',      storeName: 'Diamond Avenue',   notes: 'SLA TEST: ready to invoice for 3 days (limit 2d)' },
    { po: 'KJ-SLA-005', orderType: 'Bracelet',        metalType: '14K', metalColor: 'White Gold', status: 'READY_TO_SHIP',        storeName: 'Elite Jewels',     notes: 'SLA TEST: ready to ship for 5 days (limit 2d)' },
  ];

  for (const o of slaOrders) {
    const res = await req('POST', '/orders', { poNumber: o.po, orderType: o.orderType, metalType: o.metalType, metalColor: o.metalColor, storeName: o.storeName, customerNotes: o.notes, manufacturingPath: 'STANDARD' }, token);
    if (res.body.id) {
      if (o.status !== 'WAITING_CONFIRMATION') {
        await req('PATCH', `/orders/${res.body.id}/status`, { status: o.status }, token);
      }
      created.push({ id: res.body.id, po: o.po, status: o.status, group: 'SLA' });
      console.log(`  ✅ ${o.po} → ${o.status}`);
    }
  }

  // ── GROUP 2: MANUFACTURING / QR CODE ORDERS ──────────────────────────────
  console.log('\n=== GROUP 2: Manufacturing / QR Code Orders ===');
  const mfgOrders = [
    { po: 'KJ-MFG-001', orderType: 'Engagement Ring',  metalType: '18K', metalColor: 'White Gold',  sku: 'CJ05001-18W', status: 'VPO_ISSUED',            storeName: 'Madison Jewelers',    notes: 'VPO issued to India factory — QR test' },
    { po: 'KJ-MFG-002', orderType: 'Wedding Band',     metalType: 'Platinum', metalColor: 'Platinum', sku: 'CJ05002-PT',  status: 'ORDER_JOB_BAG_CREATED', storeName: 'Tiffany Style Co',    notes: 'Job bag created — active production' },
    { po: 'KJ-MFG-003', orderType: 'Necklace',         metalType: '14K', metalColor: 'Yellow Gold', sku: 'CJ05003-14Y', status: 'PENDING_CONTRACTOR',    storeName: 'Fifth Ave Gems',      notes: 'Awaiting stone setter contractor' },
    { po: 'KJ-MFG-004', orderType: 'Earrings',         metalType: '18K', metalColor: 'Rose Gold',   sku: 'CJ05004-18R', status: 'ORDER_JOB_BAG_CREATED', storeName: 'Rose Gold Studio',    notes: 'In polishing — QR code test order' },
    { po: 'KJ-MFG-005', orderType: 'Engagement Ring',  metalType: '18K', metalColor: 'White Gold',  sku: 'CJ05005-18W', status: 'READY_TO_INVOICE',      storeName: 'Premier Gems NYC',    notes: 'QC passed — awaiting invoice' },
  ];

  for (const o of mfgOrders) {
    const res = await req('POST', '/orders', { poNumber: o.po, orderType: o.orderType, metalType: o.metalType, metalColor: o.metalColor, kiraSkuNumber: o.sku, storeName: o.storeName, customerNotes: o.notes, manufacturingPath: 'STANDARD' }, token);
    if (res.body.id) {
      await req('PATCH', `/orders/${res.body.id}/status`, { status: o.status }, token);
      created.push({ id: res.body.id, po: o.po, status: o.status, group: 'MFG' });
      console.log(`  ✅ ${o.po} (${o.sku}) → ${o.status}`);
    }
  }

  // ── GROUP 3: REPORTS DATA (various statuses + revenue) ────────────────────
  console.log('\n=== GROUP 3: Reports Data ===');
  const reportOrders = [
    { po: 'KJ-RPT-001', orderType: 'Engagement Ring', metalType: '18K', metalColor: 'White Gold',  quotedCost: 4200, status: 'DELIVERED',           storeName: 'Sparkle Ring Co' },
    { po: 'KJ-RPT-002', orderType: 'Wedding Band',    metalType: 'Platinum', metalColor: 'Platinum', quotedCost: 2800, status: 'DELIVERED',          storeName: 'Platinum Life' },
    { po: 'KJ-RPT-003', orderType: 'Necklace',        metalType: '14K', metalColor: 'Yellow Gold',  quotedCost: 1900, status: 'SHIPPED',             storeName: 'Gold Chain NYC' },
    { po: 'KJ-RPT-004', orderType: 'Earrings',        metalType: '18K', metalColor: 'Rose Gold',    quotedCost: 1400, status: 'READY_TO_SHIP',       storeName: 'Rose Jewelry' },
    { po: 'KJ-RPT-005', orderType: 'Bracelet',        metalType: '14K', metalColor: 'White Gold',   quotedCost: 3100, status: 'ORDER_JOB_BAG_CREATED', storeName: 'Elite Bracelet Co' },
    { po: 'KJ-RPT-006', orderType: 'Engagement Ring', metalType: '18K', metalColor: 'White Gold',   quotedCost: 5500, status: 'CUSTOMER_APPROVED',   storeName: 'Diamond Dreams' },
    { po: 'KJ-RPT-007', orderType: 'Pendant',         metalType: '18K', metalColor: 'Yellow Gold',  quotedCost: 2200, status: 'CAD_IN_PROGRESS',     storeName: 'Pendant Palace' },
    { po: 'KJ-RPT-008', orderType: 'Wedding Band',    metalType: '18K', metalColor: 'White Gold',   quotedCost: 1600, status: 'DELIVERED',           storeName: 'Luxe Bands' },
    { po: 'KJ-RPT-009', orderType: 'Engagement Ring', metalType: 'Platinum', metalColor: 'Platinum', quotedCost: 7800, status: 'DELIVERED',           storeName: 'Prestige Rings' },
    { po: 'KJ-RPT-010', orderType: 'Necklace',        metalType: '14K', metalColor: 'Rose Gold',    quotedCost: 2400, status: 'SHIPPED',             storeName: 'Sparkle Chains' },
  ];

  for (const o of reportOrders) {
    const res = await req('POST', '/orders', { poNumber: o.po, orderType: o.orderType, metalType: o.metalType, metalColor: o.metalColor, storeName: o.storeName, quotedCost: o.quotedCost, customerEmail: 'customer@example.com', customerId: '3367ed36-8855-4b9c-b2d8-8514103a5863', manufacturingPath: 'STANDARD' }, token);
    if (res.body.id) {
      await req('PATCH', `/orders/${res.body.id}/status`, { status: o.status }, token);
      created.push({ id: res.body.id, po: o.po, status: o.status, group: 'RPT' });
      console.log(`  ✅ ${o.po} $${o.quotedCost} → ${o.status}`);
    }
  }

  // ── GROUP 4: CAD REVIEW ORDERS (for customer + design-awaiting test) ─────
  console.log('\n=== GROUP 4: CAD Awaiting Review (customer portal) ===');
  const cadOrders = [
    { po: 'KJ-CAD-001', orderType: 'Engagement Ring', metalType: '18K', metalColor: 'White Gold', diamondType: 'Certified Lab Grown Diamond', diamondQuality: 'VVS1', centerStoneShape: 'Round', notes: 'Customer has been waiting 6 days — overdue for review. SLA test.' },
    { po: 'KJ-CAD-002', orderType: 'Necklace',        metalType: '14K', metalColor: 'Yellow Gold', diamondType: 'Non Certified (CVD)',          diamondQuality: 'VS1',  centerStoneShape: 'Oval',  notes: 'Second revision — customer feedback incorporated' },
    { po: 'KJ-CAD-003', orderType: 'Earrings',        metalType: '18K', metalColor: 'Rose Gold',   diamondType: 'Non Certified (HPHT)',         diamondQuality: 'VS2',  centerStoneShape: 'Pear',  notes: 'First design, awaiting customer review' },
  ];

  for (const o of cadOrders) {
    const res = await req('POST', '/orders', {
      poNumber: o.po, orderType: o.orderType, metalType: o.metalType, metalColor: o.metalColor,
      diamondType: o.diamondType, diamondQuality: o.diamondQuality, centerStoneShape: o.centerStoneShape,
      customerNotes: o.notes, customerEmail: 'customer@example.com',
      customerId: '3367ed36-8855-4b9c-b2d8-8514103a5863', manufacturingPath: 'STANDARD',
    }, token);

    if (res.body.id) {
      const orderId = res.body.id;
      await req('PATCH', `/orders/${orderId}/status`, { status: 'CAD_IN_PROGRESS' }, token);

      // Upload CAD file
      const svgContent = cadSvg(`${o.po} · ${o.metalType} ${o.metalColor} · ${o.centerStoneShape}`);
      const tmpFile = path.join(cadDir, `tmp-${o.po}.svg`);
      fs.writeFileSync(tmpFile, svgContent);
      const cadRes = await upload(`/cad/upload/${orderId}`, tmpFile, `${o.po}-design-rev1.svg`, `Initial design for ${o.orderType} — ${o.metalType} ${o.metalColor}, ${o.centerStoneShape} stone`, token);
      fs.unlinkSync(tmpFile);

      if (cadRes.body.id) {
        // Send for customer approval
        await req('PATCH', `/cad/${cadRes.body.id}/send`, null, token);
        console.log(`  ✅ ${o.po} → CAD_IN_PROGRESS + design sent for approval`);
      }
      created.push({ id: orderId, po: o.po, status: 'CAD_IN_PROGRESS', group: 'CAD' });
    }
  }

  // ── GENERATE SAMPLE CSV FOR IMPORT TESTING ────────────────────────────────
  console.log('\n=== Generating Sample CSV for Import Testing ===');
  const csvRows = [
    ['PO #', 'Store Name', 'Customer Full Name', 'Email', 'Type', 'Metal Type', 'Metal Color', 'Size', 'Natural or Lab', 'Dia Quality', 'Center Stone Shape', 'Approximate Carat Weight', 'Status', 'Kira Quoted Cost', 'Customer Comments'],
    ['KJ-CSV-001', 'Diamond District NYC', 'Michael Chen', 'mchen@example.com', 'Engagement Ring', '18K', 'White Gold', '7', 'Certified Lab Grown Diamond', 'VS1', 'Round', '1.50', 'Waiting Confirmation', '4500', 'Four-prong solitaire, thin band'],
    ['KJ-CSV-002', 'Golden Gate Gems', 'Sarah Johnson', 'sjohnson@example.com', 'Wedding Band', 'Platinum', 'Platinum', '6.5', '', '', '', '', 'Waiting Confirmation', '2200', 'Comfort fit, 4mm width, milgrain edges'],
    ['KJ-CSV-003', 'Park Ave Jewelry', 'Emily Williams', 'ewilliams@example.com', 'Necklace', '14K', 'Yellow Gold', '', 'Non Certified (CVD)', 'VS2', 'Oval', '1.00', 'Waiting Confirmation', '1800', '18-inch cable chain, lobster clasp'],
    ['KJ-CSV-004', 'Beverly Hills Gems', 'Robert Brown', 'rbrown@example.com', 'Earrings', '18K', 'Rose Gold', '', 'Non Certified (HPHT)', 'VVS2', 'Round', '0.50', 'Waiting Confirmation', '2100', 'Stud style, push-back closure'],
    ['KJ-CSV-005', 'Fifth Ave Diamonds', 'Jennifer Davis', 'jdavis@example.com', 'Engagement Ring', 'Platinum', 'Platinum', '5.5', 'Certified Lab Grown Diamond', 'VVS1', 'Cushion', '2.00', 'Waiting Confirmation', '7200', 'Hidden halo, cathedral setting, very thin shank'],
    ['KJ-CSV-006', 'Miami Jewelry World', 'David Martinez', 'dmartinez@example.com', 'Bracelet', '14K', 'White Gold', '', 'Certified Lab Grown Diamond', 'VS1', 'Round', '1.20', 'Waiting Confirmation', '3400', 'Tennis bracelet, 7-inch length, 2mm stones'],
    ['KJ-CSV-007', 'Chicago Gold House', 'Lisa Anderson', 'landerson@example.com', 'Pendant', '18K', 'Yellow Gold', '', 'Non Certified (CVD)', 'VS1', 'Pear', '0.75', 'Waiting Confirmation', '1650', 'Bezel set, 16-inch snake chain included'],
    ['KJ-CSV-008', 'Houston Gem Center', 'James Wilson', 'jwilson@example.com', 'Engagement Ring', '18K', 'White Gold', '8', 'Non Certified (HPHT)', 'VS2', 'Princess', '1.75', 'Waiting Confirmation', '5800', 'Channel set band, square prongs'],
    ['KJ-CSV-009', 'Seattle Fine Jewelry', 'Ashley Taylor', 'ataylor@example.com', 'Wedding Band', '18K', 'Rose Gold', '6', '', '', '', '', 'Waiting Confirmation', '1900', 'Curved shadow band to match existing engagement ring'],
    ['KJ-CSV-010', 'Phoenix Diamond Co', 'Christopher Lee', 'clee@example.com', 'Necklace', 'Platinum', 'Platinum', '', 'Certified Lab Grown Diamond', 'VVS1', 'Emerald', '1.25', 'Waiting Confirmation', '6100', 'Art deco style, geometric frame, fine chain'],
  ];

  const csvContent = csvRows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const csvPath = path.join(__dirname, '..', 'uploads', 'imports', 'sample-import.csv');
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, csvContent);

  // Also save a copy to Desktop for easy access
  const desktopCsv = path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop', 'kira-jewels-import-sample.csv');
  try { fs.writeFileSync(desktopCsv, csvContent); console.log(`  📄 CSV also saved to Desktop: kira-jewels-import-sample.csv`); } catch {}
  console.log(`  ✅ Sample CSV created: uploads/imports/sample-import.csv (10 orders)`);

  // ── BACKDATE OVERDUE ORDERS via PostgreSQL ────────────────────────────────
  console.log('\n=== Backdating SLA Orders via Database ===');
  const overdueMap = {
    'KJ-SLA-001': 3,   // WAITING_CONFIRMATION — SLA is 1d, backdate 3 days
    'KJ-SLA-002': 6,   // PENDING_CAD — SLA is 3d, backdate 6 days
    'KJ-SLA-003': 4,   // SKU_CREATION — SLA is 2d, backdate 4 days
    'KJ-SLA-004': 4,   // READY_TO_INVOICE — SLA is 2d, backdate 4 days
    'KJ-SLA-005': 7,   // READY_TO_SHIP — SLA is 2d, backdate 7 days
    'KJ-CAD-001': 8,   // CAD_IN_PROGRESS — SLA is 7d, backdate 8 days
  };

  const db = new Client({ host: 'localhost', port: 5432, user: 'jewelflow', password: 'jewelflow123', database: 'jewelflow' });
  try {
    await db.connect();
    console.log('  Connected to PostgreSQL');
    for (const [po, days] of Object.entries(overdueMap)) {
      const backdateTs = new Date(Date.now() - days * 86400000).toISOString();
      const result = await db.query(
        'UPDATE orders SET "updatedAt" = $1, "createdAt" = $1 WHERE "poNumber" = $2',
        [backdateTs, po]
      );
      if (result.rowCount > 0) {
        console.log(`  ✅ ${po} backdated ${days} days (simulating ${days}d SLA breach)`);
      } else {
        console.log(`  ⚠ ${po} not found in DB (may not have been created yet)`);
      }
    }
    await db.end();
  } catch (e) {
    console.error('  ❌ DB connection failed:', e.message);
    console.log('  → SLA orders created but not backdated. Run manually if needed.');
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('✅ SEED COMPLETE');
  console.log('═'.repeat(60));
  console.log(`\nCreated ${created.length} orders total:`);
  console.log(`  SLA/Overdue:   ${created.filter(o=>o.group==='SLA').length} orders (backdated to trigger alerts)`);
  console.log(`  Manufacturing: ${created.filter(o=>o.group==='MFG').length} orders (with SKU, VPO, Job Bags)`);
  console.log(`  Reports data:  ${created.filter(o=>o.group==='RPT').length} orders (various statuses + revenue)`);
  console.log(`  CAD Review:    ${created.filter(o=>o.group==='CAD').length} orders (designs sent for approval)`);

  console.log('\nWhat to test now:');
  console.log('  📊 Reports page      → /reports — shows overdue orders + pipeline stats + revenue');
  console.log('  ⚠  SLA on Dashboard  → /dashboard — red SLA Breaches widget showing KJ-SLA-xxx orders');
  console.log('  📥 Import CSV        → /import — drag kira-jewels-import-sample.csv from Desktop');
  console.log('  🖨  QR Job Bag       → /orders → open KJ-MFG-001 → click 🖨 Job Bag');
  console.log('  💍 Customer Portal   → login as customer@example.com → see KJ-CAD-xxx designs awaiting approval');
  console.log('  🔔 Trigger SLA check → POST /api/proxy/sla/run as admin (or wait for 9 AM cron)');
  console.log('\nCSV import file ready on your Desktop: kira-jewels-import-sample.csv');
})();
