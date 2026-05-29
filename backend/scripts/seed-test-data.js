/**
 * Seed 20 test orders with CAD images across all workflow stages.
 * Run from: backend/  →  node scripts/seed-test-data.js
 */
const fs   = require('fs');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:4000/api/v1';

// ── Helpers ────────────────────────────────────────────────────────────────
async function req(method, url, body, token) {
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
    const fileData   = fs.readFileSync(filePath);
    const boundary   = '----FormBoundary' + Date.now();
    const ext        = path.extname(originalName).slice(1);
    const mimeMap    = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf' };
    const mime       = mimeMap[ext] || 'application/octet-stream';

    let body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${originalName}"\r\nContent-Type: ${mime}\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="designerNotes"\r\n\r\n${notes || ''}\r\n--${boundary}--\r\n`),
    ]);

    const parsed = new URL(BASE + url);
    const opts   = {
      hostname: parsed.hostname, port: parsed.port,
      path: parsed.pathname, method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        Authorization: `Bearer ${token}`,
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
    r.write(body);
    r.end();
  });
}

// ── CAD SVG Generators ─────────────────────────────────────────────────────
function svgRing(label, metalColor, stoneColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="#0a0e1a"/>
  <text x="300" y="30" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="13" font-weight="bold">KIRA JEWELS — CAD DESIGN</text>
  <!-- Shank outer -->
  <circle cx="300" cy="300" r="180" fill="none" stroke="${metalColor}" stroke-width="3" stroke-dasharray="6,3" opacity="0.4"/>
  <!-- Shank -->
  <circle cx="300" cy="300" r="160" fill="none" stroke="${metalColor}" stroke-width="22" opacity="0.85"/>
  <!-- Prong circle -->
  <circle cx="300" cy="140" r="52" fill="${metalColor}" opacity="0.9"/>
  <!-- Center stone -->
  <polygon points="300,100 330,140 300,175 270,140" fill="${stoneColor}" opacity="0.95"/>
  <line x1="300" y1="100" x2="300" y2="175" stroke="white" stroke-width="0.5" opacity="0.4"/>
  <line x1="270" y1="140" x2="330" y2="140" stroke="white" stroke-width="0.5" opacity="0.4"/>
  <!-- Prongs -->
  ${[0,72,144,216,288].map(a => {
    const rad = a * Math.PI / 180;
    const x = 300 + 50 * Math.sin(rad);
    const y = 140 - 50 * Math.cos(rad);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${metalColor}"/>`;
  }).join('\n  ')}
  <!-- Side stones -->
  ${[-60,-40,-20,20,40,60].map(offset => `<circle cx="${300+offset}" cy="${300+155}" r="7" fill="${stoneColor}" opacity="0.8"/>
  <circle cx="${300+offset}" cy="${300-155}" r="7" fill="${stoneColor}" opacity="0.8"/>`).join('\n  ')}
  <!-- Dimension lines -->
  <line x1="110" y1="300" x2="490" y2="300" stroke="#c09b58" stroke-width="0.5" opacity="0.3"/>
  <line x1="300" y1="110" x2="300" y2="490" stroke="#c09b58" stroke-width="0.5" opacity="0.3"/>
  <line x1="110" y1="490" x2="490" y2="490" stroke="#c09b58" stroke-width="1" marker-end="url(#arrow)"/>
  <text x="300" y="520" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="11">⟵ 18.2 mm ⟶</text>
  <!-- Label -->
  <text x="300" y="570" text-anchor="middle" fill="#6b7fa3" font-family="monospace" font-size="12">${label}</text>
  <text x="300" y="588" text-anchor="middle" fill="#3d4f6e" font-family="monospace" font-size="10">TOP VIEW · SCALE 1:1</text>
</svg>`;
}

function svgPendant(label, metalColor, stoneColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700" viewBox="0 0 600 700">
  <rect width="600" height="700" fill="#0a0e1a"/>
  <text x="300" y="30" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="13" font-weight="bold">KIRA JEWELS — CAD DESIGN</text>
  <!-- Bail -->
  <rect x="278" y="55" width="44" height="60" rx="10" fill="${metalColor}" opacity="0.9"/>
  <rect x="286" y="62" width="28" height="45" rx="7" fill="none" stroke="#0a0e1a" stroke-width="3"/>
  <!-- Chain connection -->
  <circle cx="300" cy="58" r="8" fill="${metalColor}"/>
  <!-- Pendant body -->
  <ellipse cx="300" cy="340" rx="130" ry="230" fill="${metalColor}" opacity="0.9"/>
  <ellipse cx="300" cy="340" rx="110" ry="210" fill="#1a2035" opacity="0.95"/>
  <!-- Center stone -->
  <ellipse cx="300" cy="310" rx="72" ry="90" fill="${stoneColor}" opacity="0.9"/>
  <ellipse cx="300" cy="310" rx="72" ry="90" fill="none" stroke="white" stroke-width="0.8" opacity="0.4"/>
  <!-- Facets -->
  <line x1="300" y1="220" x2="300" y2="400" stroke="white" stroke-width="0.6" opacity="0.3"/>
  <line x1="228" y1="310" x2="372" y2="310" stroke="white" stroke-width="0.6" opacity="0.3"/>
  <line x1="248" y1="240" x2="352" y2="380" stroke="white" stroke-width="0.5" opacity="0.2"/>
  <line x1="352" y1="240" x2="248" y2="380" stroke="white" stroke-width="0.5" opacity="0.2"/>
  <!-- Accent stones -->
  ${[0,60,120,180,240,300].map(a => {
    const rad = a * Math.PI/180;
    const x = 300 + 118*Math.sin(rad);
    const y = 340 + 205*Math.cos(rad)/1.4;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${stoneColor}" opacity="0.75"/>`;
  }).join('\n  ')}
  <text x="300" y="590" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="11">⟵ 26 mm ⟶</text>
  <text x="300" y="640" text-anchor="middle" fill="#6b7fa3" font-family="monospace" font-size="12">${label}</text>
  <text x="300" y="658" text-anchor="middle" fill="#3d4f6e" font-family="monospace" font-size="10">FRONT VIEW · SCALE 1:1</text>
</svg>`;
}

function svgEarring(label, metalColor, stoneColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="600" viewBox="0 0 700 600">
  <rect width="700" height="600" fill="#0a0e1a"/>
  <text x="350" y="30" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="13" font-weight="bold">KIRA JEWELS — CAD DESIGN (PAIR)</text>
  <!-- Left earring -->
  <circle cx="175" cy="120" r="18" fill="${metalColor}"/>
  <rect x="166" y="130" width="18" height="30" fill="${metalColor}"/>
  <polygon points="175,90 200,160 175,200 150,160" fill="${stoneColor}" opacity="0.9"/>
  <polygon points="175,90 200,160 175,200 150,160" fill="none" stroke="white" stroke-width="0.7" opacity="0.4"/>
  <line x1="175" y1="90" x2="175" y2="200" stroke="white" stroke-width="0.5" opacity="0.3"/>
  <line x1="150" y1="160" x2="200" y2="160" stroke="white" stroke-width="0.5" opacity="0.3"/>
  ${[0,72,144,216,288].map(a => {
    const rad = a*Math.PI/180;
    const x = 175+100*Math.sin(rad);
    const y = 340+130*Math.cos(rad);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="${stoneColor}" opacity="0.8"/>
  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="none" stroke="${metalColor}" stroke-width="2"/>`;
  }).join('\n  ')}
  <circle cx="175" cy="340" r="42" fill="${metalColor}" opacity="0.7"/>
  <!-- Right earring (mirror) -->
  <circle cx="525" cy="120" r="18" fill="${metalColor}"/>
  <rect x="516" y="130" width="18" height="30" fill="${metalColor}"/>
  <polygon points="525,90 550,160 525,200 500,160" fill="${stoneColor}" opacity="0.9"/>
  <polygon points="525,90 550,160 525,200 500,160" fill="none" stroke="white" stroke-width="0.7" opacity="0.4"/>
  <line x1="525" y1="90" x2="525" y2="200" stroke="white" stroke-width="0.5" opacity="0.3"/>
  <line x1="500" y1="160" x2="550" y2="160" stroke="white" stroke-width="0.5" opacity="0.3"/>
  ${[0,72,144,216,288].map(a => {
    const rad = a*Math.PI/180;
    const x = 525+100*Math.sin(rad);
    const y = 340+130*Math.cos(rad);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="${stoneColor}" opacity="0.8"/>
  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="none" stroke="${metalColor}" stroke-width="2"/>`;
  }).join('\n  ')}
  <circle cx="525" cy="340" r="42" fill="${metalColor}" opacity="0.7"/>
  <!-- center line -->
  <line x1="350" y1="50" x2="350" y2="550" stroke="#c09b58" stroke-width="0.5" stroke-dasharray="8,4" opacity="0.2"/>
  <text x="350" y="540" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="11">LEFT · SYMMETRICAL · RIGHT</text>
  <text x="350" y="572" text-anchor="middle" fill="#6b7fa3" font-family="monospace" font-size="12">${label}</text>
</svg>`;
}

function svgBracelet(label, metalColor, stoneColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="400" viewBox="0 0 700 400">
  <rect width="700" height="400" fill="#0a0e1a"/>
  <text x="350" y="30" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="13" font-weight="bold">KIRA JEWELS — CAD DESIGN</text>
  <!-- Bracelet body -->
  <ellipse cx="350" cy="200" rx="280" ry="120" fill="none" stroke="${metalColor}" stroke-width="24" opacity="0.9"/>
  <!-- Station stones -->
  ${Array.from({length:12}, (_,i) => {
    const a = (i/12)*2*Math.PI - Math.PI/2;
    const x = 350 + 280*Math.cos(a);
    const y = 200 + 120*Math.sin(a);
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="12" ry="12" fill="${stoneColor}" opacity="0.9"/>`;
  }).join('\n  ')}
  <!-- Clasp -->
  <rect x="614" y="183" width="36" height="34" rx="6" fill="${metalColor}"/>
  <rect x="620" y="189" width="24" height="22" rx="4" fill="#1a2035"/>
  <!-- dimension -->
  <line x1="70" y1="350" x2="630" y2="350" stroke="#c09b58" stroke-width="0.8" opacity="0.5"/>
  <text x="350" y="372" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="11">⟵ 180 mm (internal) ⟶</text>
  <text x="350" y="392" text-anchor="middle" fill="#6b7fa3" font-family="monospace" font-size="12">${label} · TOP VIEW</text>
</svg>`;
}

function svgBand(label, metalColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="#0a0e1a"/>
  <text x="300" y="30" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="13" font-weight="bold">KIRA JEWELS — CAD DESIGN</text>
  <!-- Outer ring -->
  <circle cx="300" cy="300" r="200" fill="none" stroke="${metalColor}" stroke-width="40" opacity="0.92"/>
  <!-- Milgrain texture dots -->
  ${Array.from({length:60}, (_,i) => {
    const a = (i/60)*2*Math.PI;
    const r = 200;
    const x = 300 + r*Math.cos(a);
    const y = 300 + r*Math.sin(a);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${metalColor}" opacity="0.5"/>`;
  }).join('\n  ')}
  <!-- Inner circle guide -->
  <circle cx="300" cy="300" r="160" fill="none" stroke="${metalColor}" stroke-width="1" stroke-dasharray="4,3" opacity="0.3"/>
  <!-- Center crosshair -->
  <circle cx="300" cy="300" r="3" fill="#c09b58" opacity="0.6"/>
  <line x1="80" y1="300" x2="520" y2="300" stroke="#c09b58" stroke-width="0.5" opacity="0.25"/>
  <line x1="300" y1="80" x2="300" y2="520" stroke="#c09b58" stroke-width="0.5" opacity="0.25"/>
  <!-- Dimension -->
  <line x1="95" y1="500" x2="505" y2="500" stroke="#c09b58" stroke-width="0.8" opacity="0.5"/>
  <text x="300" y="528" text-anchor="middle" fill="#c09b58" font-family="monospace" font-size="11">⟵ Ø 20.6 mm ⟶</text>
  <text x="300" y="565" text-anchor="middle" fill="#6b7fa3" font-family="monospace" font-size="12">${label}</text>
  <text x="300" y="582" text-anchor="middle" fill="#3d4f6e" font-family="monospace" font-size="10">TOP VIEW · SCALE 2:1</text>
</svg>`;
}

// ── Orders data ────────────────────────────────────────────────────────────
const ORDERS = [
  { orderType:'Engagement Ring',  metalType:'18K', metalColor:'White Gold',  size:'6',   diamondType:'Natural Diamond', diamondQuality:'VVS1', centerStoneShape:'Round',    approximateCaratWeight:'1.50', storeName:'Vantage Jewelry',       customerFullName:'Tyler Brooks',   notes:'Surprise proposal — very important. Size must be exact.', status:'WAITING_CONFIRMATION', cadType:'ring',     cadRev:1, cadStatus:'UPLOADED' },
  { orderType:'Engagement Ring',  metalType:'18K', metalColor:'Rose Gold',   size:'5.5', diamondType:'Lab Grown Diamond',diamondQuality:'VS1',  centerStoneShape:'Oval',     approximateCaratWeight:'2.00', storeName:'Serenity Fine',         customerFullName:'Fatima Al-Rashid', notes:'Customer wants a hidden halo detail.', status:'PENDING_CAD', cadType:'ring', cadRev:1, cadStatus:'UPLOADED' },
  { orderType:'Necklace',         metalType:'14K', metalColor:'Yellow Gold',  size:'',   diamondType:'Natural Diamond', diamondQuality:'VS2',  centerStoneShape:'Pear',     approximateCaratWeight:'0.85', storeName:'Luxe Jewelers',         customerFullName:'Ben Foster',     notes:'18-inch chain, lobster clasp.', status:'CAD_IN_PROGRESS', cadType:'pendant', cadRev:1, cadStatus:'SENT_FOR_APPROVAL' },
  { orderType:'Earrings',         metalType:'18K', metalColor:'White Gold',  size:'',    diamondType:'Natural Diamond', diamondQuality:'VVS2', centerStoneShape:'Round',    approximateCaratWeight:'0.50', storeName:'Diamond District',      customerFullName:'Alicia Monroe',  notes:'Stud post with butterfly backs.', status:'CAD_IN_PROGRESS', cadType:'earring', cadRev:2, cadStatus:'SENT_FOR_APPROVAL' },
  { orderType:'Wedding Band',     metalType:'Platinum',metalColor:'Platinum',size:'7',   diamondType:'Natural Diamond', diamondQuality:'VVS1', centerStoneShape:'Round',    approximateCaratWeight:'0.30', storeName:'Premier Gems',          customerFullName:'Kevin Hartley',  notes:'Eternity band, 2mm stones.', status:'CUSTOMER_APPROVED', cadType:'band', cadRev:1, cadStatus:'APPROVED' },
  { orderType:'Bracelet',         metalType:'18K', metalColor:'Yellow Gold',  size:'',   diamondType:'Natural Diamond', diamondQuality:'VS1',  centerStoneShape:'Round',    approximateCaratWeight:'1.20', storeName:'Artisan Goldworks',     customerFullName:'Diane Okafor',   notes:'Tennis bracelet, 7 inch.', status:'SKU_CREATION', cadType:'bracelet', cadRev:1, cadStatus:'APPROVED' },
  { orderType:'Engagement Ring',  metalType:'18K', metalColor:'White Gold',  size:'6.5', diamondType:'Natural Diamond', diamondQuality:'VS1',  centerStoneShape:'Cushion',  approximateCaratWeight:'1.80', storeName:'Stellar Jewels',        customerFullName:'Nathan Cruz',    notes:'Cathedral setting, thin band.', status:'VPO_ISSUED', cadType:'ring', cadRev:2, cadStatus:'APPROVED' },
  { orderType:'Pendant',          metalType:'14K', metalColor:'Rose Gold',   size:'',    diamondType:'Sapphire',        diamondQuality:'VS2',  centerStoneShape:'Oval',     approximateCaratWeight:'1.00', storeName:'The Ring Vault',        customerFullName:'Brianna Walsh',  notes:'Blue sapphire with diamond halo.', status:'PENDING_CONTRACTOR', cadType:'pendant', cadRev:1, cadStatus:'APPROVED' },
  { orderType:'Wedding Band',     metalType:'14K', metalColor:'Yellow Gold',  size:'9',  diamondType:'No Stone',        diamondQuality:'',     centerStoneShape:'',         approximateCaratWeight:'',     storeName:'Timeless Pieces',       customerFullName:'Yuki Tanaka',    notes:'Plain comfort fit band, 4mm width.', status:'ORDER_JOB_BAG_CREATED', cadType:'band', cadRev:1, cadStatus:'APPROVED' },
  { orderType:'Earrings',         metalType:'18K', metalColor:'White Gold',  size:'',    diamondType:'Natural Diamond', diamondQuality:'VS2',  centerStoneShape:'Marquise', approximateCaratWeight:'0.70', storeName:'Silver & Stone',        customerFullName:'Marco Bianchi',  notes:'Dangle style, secure snap closure.', status:'READY_TO_INVOICE', cadType:'earring', cadRev:1, cadStatus:'APPROVED' },
  { orderType:'Engagement Ring',  metalType:'Platinum',metalColor:'Platinum',size:'7',   diamondType:'Natural Diamond', diamondQuality:'VVS1', centerStoneShape:'Princess', approximateCaratWeight:'2.20', storeName:'Elite Jewelry Studio',  customerFullName:'Laura Kim',      notes:'Four-prong setting, milgrain edge.', status:'READY_TO_SHIP', cadType:'ring', cadRev:3, cadStatus:'APPROVED' },
  { orderType:'Necklace',         metalType:'18K', metalColor:'White Gold',  size:'',    diamondType:'Emerald',         diamondQuality:'VS1',  centerStoneShape:'Emerald',  approximateCaratWeight:'1.50', storeName:'Rocky Mtn Gems',        customerFullName:'Ahmed Hassan',   notes:'16-inch snake chain, bezel set.', status:'SHIPPED', cadType:'pendant', cadRev:1, cadStatus:'APPROVED' },
  { orderType:'Bracelet',         metalType:'14K', metalColor:'Rose Gold',   size:'',    diamondType:'Lab Grown Diamond',diamondQuality:'VS2', centerStoneShape:'Round',    approximateCaratWeight:'0.90', storeName:'Coastal Diamonds',      customerFullName:'Nia Obi',        notes:'Flex bangle style.', status:'DELIVERED', cadType:'bracelet', cadRev:1, cadStatus:'APPROVED' },
  { orderType:'Engagement Ring',  metalType:'18K', metalColor:'Yellow Gold', size:'5',   diamondType:'Natural Diamond', diamondQuality:'SI1',  centerStoneShape:'Pear',     approximateCaratWeight:'1.30', storeName:'Modern Sparkle',        customerFullName:'Ethan Ross',     notes:'East-west pear setting.', status:'CAD_IN_PROGRESS', cadType:'ring', cadRev:1, cadStatus:'REVISION_REQUESTED' },
  { orderType:'Pendant',          metalType:'10K', metalColor:'White Gold',  size:'',    diamondType:'Moissanite',      diamondQuality:'VS1',  centerStoneShape:'Round',    approximateCaratWeight:'1.00', storeName:'Heritage Gems',         customerFullName:'Rachel Green',   notes:'Compass rose design.', status:'PENDING_CAD', cadType:'pendant', cadRev:0, cadStatus:null },
  { orderType:'Wedding Band',     metalType:'18K', metalColor:'Rose Gold',   size:'6',   diamondType:'Natural Diamond', diamondQuality:'VVS2', centerStoneShape:'Round',    approximateCaratWeight:'0.40', storeName:'Crown Jewelers',        customerFullName:'David Park',     notes:'Curved shadow band to match existing ring.', status:'WAITING_CONFIRMATION', cadType:'band', cadRev:0, cadStatus:null },
  { orderType:'Earrings',         metalType:'Platinum',metalColor:'Platinum',size:'',    diamondType:'Natural Diamond', diamondQuality:'VVS1', centerStoneShape:'Round',    approximateCaratWeight:'1.00', storeName:'Pearls & Gems',         customerFullName:'Sofia Reyes',    notes:'Huggie hoops with pave.', status:'CAD_IN_PROGRESS', cadType:'earring', cadRev:2, cadStatus:'SENT_FOR_APPROVAL' },
  { orderType:'Engagement Ring',  metalType:'18K', metalColor:'White Gold',  size:'7',   diamondType:'Lab Grown Diamond',diamondQuality:'VS1', centerStoneShape:'Radiant',  approximateCaratWeight:'2.50', storeName:'Gold Workshop',         customerFullName:'Carlos Mendez',  notes:'Three-stone, emerald side stones.', status:'SKU_CREATION', cadType:'ring', cadRev:1, cadStatus:'APPROVED' },
  { orderType:'Necklace',         metalType:'14K', metalColor:'Yellow Gold', size:'',    diamondType:'Ruby',            diamondQuality:'VS2',  centerStoneShape:'Oval',     approximateCaratWeight:'0.75', storeName:'Sunrise Jewelers',      customerFullName:'Priya Sharma',   notes:'Vintage-inspired filigree.', status:'VPO_ISSUED', cadType:'pendant', cadRev:1, cadStatus:'APPROVED' },
  { orderType:'Wedding Band',     metalType:'Platinum',metalColor:'Platinum',size:'10',  diamondType:'Natural Diamond', diamondQuality:'VVS2', centerStoneShape:'Round',    approximateCaratWeight:'0.60', storeName:'Diamond Collection NYC',customerFullName:'James Carter',   notes:'Half eternity, 2.5mm stones, comfort fit.', status:'ORDER_JOB_BAG_CREATED', cadType:'band', cadRev:1, cadStatus:'APPROVED' },
];

// Metal colors for SVG
const METAL_SVG = {
  'White Gold': '#d0d8e8', 'Yellow Gold': '#c09b58', 'Rose Gold': '#d4956a',
  'Platinum': '#b8c4d4', 'Sterling Silver': '#c8d0dc', '18K': '#c09b58',
  '14K': '#b8944e', '10K': '#a0823e', 'default': '#c09b58',
};
const STONE_SVG = {
  'Natural Diamond': '#e8f4ff', 'Lab Grown Diamond': '#ddeeff',
  'Sapphire': '#4a80c4', 'Ruby': '#c43a3a', 'Emerald': '#2d8a4e',
  'Moissanite': '#b8d4f0', 'No Stone': '#555', 'default': '#c8e0f8',
};

// Generate SVG content
function generateCadSvg(order, revNum) {
  const mc = METAL_SVG[order.metalColor] || METAL_SVG[order.metalType] || METAL_SVG.default;
  const sc = STONE_SVG[order.diamondType] || STONE_SVG.default;
  const lbl = `${order.poNumber || order.orderType} · Rev ${revNum} · ${order.metalType} ${order.metalColor}`;
  switch (order.cadType) {
    case 'ring':     return svgRing(lbl, mc, sc);
    case 'pendant':  return svgPendant(lbl, mc, sc);
    case 'earring':  return svgEarring(lbl, mc, sc);
    case 'bracelet': return svgBracelet(lbl, mc, sc);
    case 'band':     return svgBand(lbl, mc);
    default:         return svgRing(lbl, mc, sc);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  // Ensure uploads/cad dir exists
  const cadDir = path.join(__dirname, '..', 'uploads', 'cad');
  fs.mkdirSync(cadDir, { recursive: true });

  // 1. Login
  console.log('Logging in as admin...');
  const loginRes = await req('POST', '/auth/login', { email: 'admin@kirajewels.one', password: 'KiRa@Admin#2025!' });
  if (!loginRes.body.access_token) { console.error('Login failed:', loginRes.body); process.exit(1); }
  const token = loginRes.body.access_token;
  console.log('✅ Logged in\n');

  let created = 0, cadUploaded = 0;

  for (let i = 0; i < ORDERS.length; i++) {
    const tmpl = ORDERS[i];
    const poNum = `KJ-TEST-${String(200 + i + 1).padStart(3, '0')}`;

    // 2. Create order (as admin — need explicit poNumber)
    const orderPayload = {
      poNumber: poNum,
      orderType: tmpl.orderType, metalType: tmpl.metalType, metalColor: tmpl.metalColor,
      size: tmpl.size || undefined, diamondType: tmpl.diamondType || undefined,
      diamondQuality: tmpl.diamondQuality || undefined, centerStoneShape: tmpl.centerStoneShape || undefined,
      approximateCaratWeight: tmpl.approximateCaratWeight || undefined,
      customerNotes: tmpl.notes, storeName: tmpl.storeName,
      customerFullName: tmpl.customerFullName, customerEmail: `${tmpl.customerFullName.toLowerCase().replace(/[^a-z]/g,'')}@example.com`,
      manufacturingPath: 'STANDARD',
    };

    const oRes = await req('POST', '/orders', orderPayload, token);
    if (!oRes.body.id) { console.error(`  ✗ Order ${poNum} failed:`, oRes.body.message); continue; }
    const orderId = oRes.body.id;
    created++;

    // 3. Upload CAD SVG (if this order needs one)
    if (tmpl.cadRev > 0 && tmpl.cadStatus) {
      for (let rev = 1; rev <= tmpl.cadRev; rev++) {
        const svgContent = generateCadSvg({ ...tmpl, poNumber: poNum }, rev);
        const tmpFile = path.join(cadDir, `tmp-${poNum}-rev${rev}.svg`);
        fs.writeFileSync(tmpFile, svgContent);

        const designerNotes = rev === 1
          ? `Initial design for ${tmpl.orderType} — ${tmpl.metalType} ${tmpl.metalColor}${tmpl.centerStoneShape ? ', ' + tmpl.centerStoneShape + ' stone' : ''}`
          : `Revision ${rev}: Updated per customer feedback`;

        const cRes = await upload(
          `/cad/upload/${orderId}`,
          tmpFile,
          `${poNum}-cad-rev${rev}.svg`,
          designerNotes,
          token
        );
        fs.unlinkSync(tmpFile); // remove temp file

        if (cRes.body.id) {
          cadUploaded++;
          const cadId = cRes.body.id;

          // Set CAD status
          if (tmpl.cadStatus === 'SENT_FOR_APPROVAL') {
            await req('PATCH', `/cad/${cadId}/send`, null, token);
          } else if (tmpl.cadStatus === 'APPROVED') {
            await req('PATCH', `/cad/${cadId}/approve`, { feedback: 'Approved — looks great' }, token);
          } else if (tmpl.cadStatus === 'REVISION_REQUESTED') {
            await req('PATCH', `/cad/${cadId}/revision`, { feedback: 'Please adjust the prong height and refine the shank taper.' }, token);
          }
          // UPLOADED stays as-is
        }
      }
    }

    // 4. Move order to target status
    const TARGET_STATUS = tmpl.status;
    if (TARGET_STATUS !== 'WAITING_CONFIRMATION') {
      await req('PATCH', `/orders/${orderId}/status`, { status: TARGET_STATUS }, token);
    }

    console.log(`  ✅ [${String(i+1).padStart(2,'0')}] ${poNum} · ${tmpl.orderType} · ${TARGET_STATUS}${tmpl.cadRev > 0 ? ` · ${tmpl.cadRev} CAD file(s)` : ''}`);
  }

  console.log(`\n✅ Done — ${created} orders created, ${cadUploaded} CAD files uploaded`);
})();
