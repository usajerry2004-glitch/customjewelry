// JewelFlow OS - Realistic Test Data Seed
const { execSync } = require('child_process');

const API = 'http://localhost:4000/api/v1';
const PSQL = '"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe"';
process.env.PGPASSWORD = 'jewelflow123';

function psql(sql) {
  try { execSync(`${PSQL} -U jewelflow -d jewelflow -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' }); }
  catch(e) { /* ignore individual insert errors */ }
}

async function api(path, method = 'GET', body = null, token = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  return r.json().catch(() => ({}));
}

async function main() {
  // Login
  console.log('Logging in...');
  const login = await api('/auth/login', 'POST', { email: 'admin@kirajewels.one', password: 'admin123' });
  const token = login.access_token;

  // Staff IDs
  const ADMIN_ID   = '8fb73df7-85f2-4733-838e-5f65c1e01580';
  const AUTH_ID    = '41c8433b-4b73-4a94-8102-0bd87da8ce8a';
  const CAD_ID     = '1e495f96-ea5e-4e3e-a5f5-98ca50066582';
  const SKU_ID     = '0dda2cc0-04d3-4e66-ac4f-4645c6bcc74d';
  const FACTORY_ID = '75f6d089-b7b9-464f-bb4e-92c14a24d8dd';
  const SHIP_ID    = '04031c58-7576-4757-92b0-21149219c122';
  const SALES_ID   = '6456ebcc-53bb-4b78-a714-3fda1c5c50d0';

  // ── 20 CUSTOMERS ─────────────────────────────────────────────────────────
  const customers = [
    { firstName:'James',   lastName:'Sullivan',   email:'james@diamondcollectionnyc.com',  store:'Diamond Collection NYC' },
    { firstName:'Priya',   lastName:'Mehta',      email:'priya@sunrisejewelers.com',        store:'Sunrise Jewelers' },
    { firstName:'Carlos',  lastName:'Reyes',      email:'carlos@goldworkshop.com',          store:'The Gold Workshop' },
    { firstName:'Sofia',   lastName:'Chen',       email:'sofia@pearlsandgems.com',          store:'Pearls & Gems Studio' },
    { firstName:'David',   lastName:'Kim',        email:'david@crownjewelers.com',          store:'Crown Jewelers' },
    { firstName:'Rachel',  lastName:'Morris',     email:'rachel@heritagegems.com',          store:'Heritage Gems' },
    { firstName:'Ethan',   lastName:'Brooks',     email:'ethan@modernsparkle.com',          store:'Modern Sparkle Co.' },
    { firstName:'Nia',     lastName:'Thompson',   email:'nia@coastaldiamonds.com',          store:'Coastal Diamonds' },
    { firstName:'Ahmed',   lastName:'Hassan',     email:'ahmed@rockymtngems.com',           store:'Rocky Mountain Gems' },
    { firstName:'Laura',   lastName:'Fitzgerald', email:'laura@elitejewelrystudio.com',     store:'Elite Jewelry Studio' },
    { firstName:'Marco',   lastName:'Ferretti',   email:'marco@silverandstone.com',         store:'Silver & Stone' },
    { firstName:'Yuki',    lastName:'Nakamura',   email:'yuki@timelesspieces.com',          store:'Timeless Pieces' },
    { firstName:'Brianna', lastName:'Clark',      email:'brianna@theringvault.com',         store:'The Ring Vault' },
    { firstName:'Nathan',  lastName:'Patel',      email:'nathan@stellarjewels.com',         store:'Stellar Jewels' },
    { firstName:'Diane',   lastName:'Leblanc',    email:'diane@artisangoldworks.com',       store:'Artisan Gold Works' },
    { firstName:'Kevin',   lastName:'Osei',       email:'kevin@premiergems.com',            store:'Premier Gems Inc.' },
    { firstName:'Alicia',  lastName:'Vega',       email:'alicia@diamonddistrict.com',       store:'Diamond District Co.' },
    { firstName:'Ben',     lastName:'Hartley',    email:'ben@luxejewelers.com',             store:'Luxe Jewelers' },
    { firstName:'Fatima',  lastName:'Al-Rashid',  email:'fatima@serenityfine.com',          store:'Serenity Fine Jewelry' },
    { firstName:'Tyler',   lastName:'Wade',       email:'tyler@vantagejewelry.com',         store:'Vantage Jewelry' },
  ];

  console.log('\nCreating 20 customers...');
  const custIds = {};
  for (const c of customers) {
    const res = await api('/users', 'POST', { firstName: c.firstName, lastName: c.lastName, email: c.email, storeName: c.store, password: 'test123', role: 'CUSTOMER' }, token);
    const id = res.id || null;
    if (id) { custIds[c.email] = id; console.log(`  + ${c.store}`); }
    else {
      // Already exists - find it
      const all = await api('/users?role=CUSTOMER', 'GET', null, token);
      const found = all.find?.(u => u.email === c.email);
      if (found) { custIds[c.email] = found.id; console.log(`  ~ ${c.store} (exists)`); }
    }
  }

  const cid = i => custIds[customers[i].email];
  const cemail = i => customers[i].email;
  const cname = i => `${customers[i].firstName} ${customers[i].lastName}`;
  const cstore = i => customers[i].store;

  // ── 30 ORDERS ────────────────────────────────────────────────────────────
  const orders = [
    // WAITING_CONFIRMATION
    { po:'KJ-TEST-001', status:'WAITING_CONFIRMATION', ci:0,  type:'Ring',     metal:'18K', color:'WG-White',         shape:'Oval',     carat:'1.20', quality:'VS1-G',  cost:1850, notes:'Customer wants a classic oval solitaire. Thin band, 4-prong head. She would like to see a few head style options in the CAD.' },
    { po:'KJ-TEST-002', status:'WAITING_CONFIRMATION', ci:1,  type:'Pendant',  metal:'14K', color:'YG-Yellow',        shape:'Round',    carat:'0.75', quality:'SI1-H',  cost:920,  notes:'Simple bezel-set round pendant for everyday wear. No chain needed, just the pendant.' },
    { po:'KJ-TEST-003', status:'WAITING_CONFIRMATION', ci:2,  type:'Earrings', metal:'18K', color:'RG-Rose',          shape:'Cushion',  carat:'0.50', quality:'VS2-F',  cost:1400, notes:'Matching cushion studs. Customer wants a low basket setting. Ref: sent Instagram DM with inspiration photo.' },
    // PENDING_CAD
    { po:'KJ-TEST-004', status:'PENDING_CAD', ci:3,  type:'Ring',     metal:'14K', color:'WG-White',          shape:'Emerald',  carat:'1.50', quality:'F+VS+',  cost:2200, notes:'East-west emerald solitaire. Sleek knife-edge shank, no side stones.' },
    { po:'KJ-TEST-005', status:'PENDING_CAD', ci:4,  type:'Pendant',  metal:'18K', color:'WY-White and Yellow',shape:'Pear',     carat:'0.90', quality:'VVS2-E', cost:1750, notes:'Pear pendant with hidden halo. Yellow gold frame, white gold prongs. Customer wants a delicate chain loop.' },
    { po:'KJ-TEST-006', status:'PENDING_CAD', ci:5,  type:'Ring',     metal:'14K', color:'RG-Rose',           shape:'Round',    carat:'1.00', quality:'VS1-G',  cost:1600, notes:'Three-stone ring: 1ct center, 0.30ct each side. Classic cathedral shank.' },
    // CAD_IN_PROGRESS
    { po:'KJ-TEST-007', status:'CAD_IN_PROGRESS', ci:6,  type:'Ring',     metal:'18K', color:'WG-White', shape:'Radiant',  carat:'1.75', quality:'VS1-F',  cost:2950, notes:'Radiant halo ring. Shared-prong micropave halo and down the shank both sides. Thin 1.8mm band.' },
    { po:'KJ-TEST-008', status:'CAD_IN_PROGRESS', ci:7,  type:'Bracelet', metal:'14K', color:'YG-Yellow',shape:'Round',    carat:'2.00', quality:'SI1-G',  cost:3100, notes:'Tennis bracelet, 7 inches. 4-prong round diamonds. Classic Tiffany-style spacing.' },
    { po:'KJ-TEST-009', status:'CAD_IN_PROGRESS', ci:8,  type:'Ring',     metal:'18K', color:'WG-White', shape:'Princess', carat:'1.25', quality:'VVS1-D',cost:3400, notes:'Princess solitaire, high cathedral. Very classic and clean, no additional diamonds. 2mm band width.' },
    // CUSTOMER_APPROVED
    { po:'KJ-TEST-010', status:'CUSTOMER_APPROVED', ci:9,  type:'Ring',    metal:'14K', color:'WG-White',  shape:'Oval',    carat:'1.50', quality:'VS2-G',  cost:2100, notes:'Oval hidden halo with split shank. Customer approved design on 2nd revision.' },
    { po:'KJ-TEST-011', status:'CUSTOMER_APPROVED', ci:10, type:'Pendant', metal:'18K', color:'WG-White',  shape:'Round',   carat:'1.00', quality:'VVS2-F', cost:1900, notes:'Bezel pendant with fine pave border. Customer loved the CAD, approved first time.' },
    { po:'KJ-TEST-012', status:'CUSTOMER_APPROVED', ci:11, type:'Ring',    metal:'14K', color:'Two-Tone',  shape:'Cushion', carat:'2.00', quality:'VS1-F',  cost:3800, notes:'Cushion halo, yellow gold basket, white gold halo and shank. Approved after 1 minor tweak.' },
    // CUSTOMER_REJECTED
    { po:'KJ-TEST-013', status:'CUSTOMER_REJECTED', ci:12, type:'Ring',    metal:'14K', color:'YG-Yellow', shape:'Round',   carat:'0.80', quality:'SI1-H',  cost:1100, notes:'Customer rejected the halo design, wants to switch to a solitaire. Will resubmit after internal discussion.' },
    { po:'KJ-TEST-014', status:'CUSTOMER_REJECTED', ci:13, type:'Earrings',metal:'18K', color:'WG-White',  shape:'Pear',    carat:'0.60', quality:'VS2-G',  cost:1650, notes:'Pear drop earrings. Customer rejected - prong placement looked off in render. Needs CAD revision.' },
    // SKU_CREATION
    { po:'KJ-TEST-015', status:'SKU_CREATION', ci:14, type:'Ring',    metal:'18K', color:'WG-White', shape:'Oval',  carat:'1.80', quality:'VVS1-E', cost:3200, sku:'CJ01015-18W', notes:'Oval micropave band. Ready for SKU assignment.' },
    { po:'KJ-TEST-016', status:'SKU_CREATION', ci:15, type:'Pendant', metal:'14K', color:'RG-Rose',  shape:'Heart', carat:'0.50', quality:'VS1-G',  cost:850,  sku:'CJ01016-14R', notes:'Heart pendant, prong set. Customer initials to be engraved on back.' },
    // VPO_ISSUED
    { po:'KJ-TEST-017', status:'VPO_ISSUED', ci:16, type:'Ring',    metal:'14K', color:'WG-White',  shape:'Round', carat:'1.00', quality:'VS2-G',  cost:1700, sku:'CJ01017-14W', vpo:'VPO-40291', jb:'JB-40291', vendor:'Creations', notes:'Solitaire prong ring. VPO issued to Creations factory.' },
    { po:'KJ-TEST-018', status:'VPO_ISSUED', ci:17, type:'Pendant', metal:'18K', color:'YG-Yellow', shape:'Oval',  carat:'0.75', quality:'VS1-F',  cost:1350, sku:'CJ01018-18Y', vpo:'VPO-40292', jb:'JB-40292', vendor:'Creations', notes:'Oval bezel pendant. Factory confirmed receipt of VPO.' },
    // ORDER_JOB_BAG_CREATED
    { po:'KJ-TEST-019', status:'ORDER_JOB_BAG_CREATED', ci:18, type:'Ring',     metal:'18K', color:'WG-White',  shape:'Cushion', carat:'2.50', quality:'VVS2-E', cost:5200, sku:'CJ01019-18W', vpo:'VPO-40280', jb:'JB-40280', vendor:'Creations',  notes:'Cushion halo major piece. Job bag created, in production.' },
    { po:'KJ-TEST-020', status:'ORDER_JOB_BAG_CREATED', ci:19, type:'Bracelet', metal:'14K', color:'YG-Yellow', shape:'Round',   carat:'3.00', quality:'SI1-G',  cost:4100, sku:'CJ01020-14Y', vpo:'VPO-40281', jb:'JB-40281', vendor:'RC Factory', notes:'Tennis bracelet production started. Expected completion in 10 days.' },
    // READY_TO_INVOICE
    { po:'KJ-TEST-021', status:'READY_TO_INVOICE', ci:0,  type:'Ring',     metal:'14K', color:'WG-White', shape:'Marquise', carat:'1.10', quality:'VS1-F',  cost:1950, sku:'CJ01021-14W', notes:'Marquise solitaire. Ready to invoice, awaiting final QC sign-off.' },
    { po:'KJ-TEST-022', status:'READY_TO_INVOICE', ci:1,  type:'Earrings', metal:'18K', color:'WG-White', shape:'Round',    carat:'1.00', quality:'VVS2-F', cost:2800, sku:'CJ01022-18W', notes:'Diamond stud earrings, 4-prong basket. Both pieces match perfectly.' },
    // READY_TO_SHIP
    { po:'KJ-TEST-023', status:'READY_TO_SHIP', ci:2,  type:'Ring',    metal:'18K', color:'WY-White and Yellow', shape:'Pear',  carat:'1.30', quality:'VS2-G',  cost:2400, sku:'CJ01023-18WY', notes:'Pear solitaire two-tone. Packaged and ready for dispatch.' },
    { po:'KJ-TEST-024', status:'READY_TO_SHIP', ci:3,  type:'Pendant', metal:'14K', color:'WG-White',            shape:'Oval',  carat:'0.85', quality:'VS1-H',  cost:1200, sku:'CJ01024-14W',  notes:'Oval bezel pendant with diamond halo. Appraisal certificate included.' },
    { po:'KJ-TEST-025', status:'READY_TO_SHIP', ci:4,  type:'Ring',    metal:'14K', color:'RG-Rose',             shape:'Round', carat:'0.90', quality:'SI1-G',  cost:1450, sku:'CJ01025-14R',  notes:'Rose gold solitaire. Ring box and cert packed.' },
    // SHIPPED
    { po:'KJ-TEST-026', status:'SHIPPED', ci:5,  type:'Ring',     metal:'18K', color:'WG-White',  shape:'Oval',    carat:'1.60', quality:'VS1-F',  cost:2750, sku:'CJ01026-18W', tracking:'77312940298410',      shipMethod:'FedEx', notes:'Shipped via FedEx overnight. ETA 2 business days.' },
    { po:'KJ-TEST-027', status:'SHIPPED', ci:6,  type:'Pendant',  metal:'14K', color:'YG-Yellow', shape:'Round',   carat:'0.70', quality:'VS2-G',  cost:980,  sku:'CJ01027-14Y', tracking:'1Z9V39W40394830428',  shipMethod:'UPS',   notes:'UPS ground, 5-day delivery.' },
    { po:'KJ-TEST-028', status:'SHIPPED', ci:7,  type:'Earrings', metal:'18K', color:'WG-White',  shape:'Cushion', carat:'1.20', quality:'VVS1-E', cost:3600, sku:'CJ01028-18W', tracking:'9261290100830090',     shipMethod:'FedEx', notes:'High-value shipment. Signature required on delivery.' },
    // DELIVERED
    { po:'KJ-TEST-029', status:'DELIVERED', ci:8,  type:'Ring',    metal:'18K', color:'WG-White', shape:'Round',   carat:'2.00', quality:'VVS2-D', cost:6200, sku:'CJ01029-18W', tracking:'77312940298499',     shipMethod:'FedEx', notes:'Delivered and confirmed. Customer extremely happy with the piece.' },
    { po:'KJ-TEST-030', status:'DELIVERED', ci:9,  type:'Pendant', metal:'14K', color:'WG-White', shape:'Emerald', carat:'1.00', quality:'VS1-G',  cost:1800, sku:'CJ01030-14W', tracking:'1Z9V39W40394830500', shipMethod:'UPS',   notes:'Delivered. Customer sent thank-you note, requesting repeat order.' },
  ];

  console.log('\nCreating 30 orders...');
  const orderIds = {};
  for (const o of orders) {
    const body = {
      poNumber: o.po, orderType: o.type, metalType: o.metal, metalColor: o.color,
      centerStoneShape: o.shape, approximateCaratWeight: o.carat, diamondQuality: o.quality,
      quotedCost: o.cost, customerNotes: o.notes, manufacturingPath: 'STANDARD',
      customerId: cid(o.ci), customerEmail: cemail(o.ci), customerFullName: cname(o.ci),
      storeName: cstore(o.ci), salesRepEmail: 'sales@kirajewels.one', diamondType: 'Lab',
      kiraSkuNumber: o.sku || null, vendorName: o.vendor || null,
      rcVpoNumber: o.vpo || null, rcJobBagNumber: o.jb || null,
      trackingNumber: o.tracking || null, shipMethod: o.shipMethod || null,
    };
    const res = await api('/orders', 'POST', body, token);
    if (res.id) {
      orderIds[o.po] = res.id;
      // Update status directly in DB (API create starts at WAITING_CONFIRMATION)
      execSync(`${PSQL} -U jewelflow -d jewelflow -c "UPDATE orders SET status='${o.status}' WHERE id='${res.id}';"`, { stdio: 'pipe' });
      console.log(`  + ${o.po} [${o.status}]`);
    } else {
      console.log(`  ! Skipped ${o.po} (${JSON.stringify(res).substring(0,80)})`);
    }
  }

  // ── CAD FILES ────────────────────────────────────────────────────────────
  console.log('\nCreating CAD files...');
  const cadFiles = [
    { po:'KJ-TEST-004', file:'oval_solitaire_v1.stl',      status:'UPLOADED',           rev:1, notes:'Initial CAD uploaded. East-west orientation as requested. Please review proportions.' },
    { po:'KJ-TEST-005', file:'pear_pendant_halo_v1.3dm',   status:'UPLOADED',           rev:1, notes:'First draft: pear pendant with hidden halo. Chain loop slightly larger for flexibility.' },
    { po:'KJ-TEST-006', file:'3stone_cathedral_v1.stl',    status:'UPLOADED',           rev:1, notes:'Three-stone CAD ready for review. Side stone ratio set to 30% of center.' },
    { po:'KJ-TEST-007', file:'radiant_halo_v1.3dm',        status:'SENT_FOR_APPROVAL',  rev:1, notes:'Radiant halo with micropave shank. Please review the halo spacing and band width.' },
    { po:'KJ-TEST-007', file:'radiant_halo_v2.stl',        status:'SENT_FOR_APPROVAL',  rev:2, notes:'Revised: tightened halo, thinned band to 1.8mm as requested. Ready for final approval.' },
    { po:'KJ-TEST-008', file:'tennis_bracelet_v1.obj',     status:'SENT_FOR_APPROVAL',  rev:1, notes:'Tennis bracelet CAD: 25 stones, 4-prong each. Classic spacing. Sent to customer for approval.' },
    { po:'KJ-TEST-009', file:'princess_solitaire_v1.stl',  status:'SENT_FOR_APPROVAL',  rev:1, notes:'High cathedral princess solitaire. Clean profile, 2mm band. Ready for customer review.' },
    { po:'KJ-TEST-010', file:'oval_hidden_halo_v1.3dm',    status:'APPROVED',           rev:1, notes:'First CAD submitted.' },
    { po:'KJ-TEST-010', file:'oval_hidden_halo_v2.3dm',    status:'APPROVED',           rev:2, notes:'Split shank adjusted as per customer request. Approved by customer.' },
    { po:'KJ-TEST-011', file:'bezel_pave_pendant_v1.stl',  status:'APPROVED',           rev:1, notes:'Bezel with pave border. Customer approved on first submission.' },
    { po:'KJ-TEST-012', file:'cushion_halo_2tone_v1.3dm',  status:'APPROVED',           rev:1, notes:'Initial design submitted.' },
    { po:'KJ-TEST-012', file:'cushion_halo_2tone_v2.3dm',  status:'APPROVED',           rev:2, notes:'Minor halo gap adjustment. Customer approved final version.' },
    { po:'KJ-TEST-013', file:'halo_ring_v1.stl',           status:'REJECTED',           rev:1, notes:'Customer requested change from halo to solitaire design entirely.' },
    { po:'KJ-TEST-014', file:'pear_earrings_v1.3dm',       status:'REVISION_REQUESTED', rev:1, notes:'Customer noted prong orientation looks awkward. Requesting side-view adjustment.' },
    { po:'KJ-TEST-015', file:'oval_micropave_final.stl',   status:'APPROVED',           rev:1, notes:'Final approved CAD for production.' },
    { po:'KJ-TEST-016', file:'heart_pendant_final.3dm',    status:'APPROVED',           rev:1, notes:'Heart pendant approved. Engraving spec noted on back face.' },
    { po:'KJ-TEST-017', file:'round_solitaire_final.stl',  status:'APPROVED',           rev:1, notes:'Production-ready file. 4-prong head confirmed.' },
    { po:'KJ-TEST-018', file:'oval_bezel_final.3dm',       status:'APPROVED',           rev:1, notes:'Production-ready file. Chain loop 5mm inner diameter.' },
    { po:'KJ-TEST-019', file:'cushion_halo_prod_final.stl',status:'APPROVED',           rev:2, notes:'Final production CAD for cushion halo. Halo gap verified uniform.' },
    { po:'KJ-TEST-020', file:'tennis_bracelet_final.obj',  status:'APPROVED',           rev:1, notes:'Tennis bracelet production file. Box clasp specified.' },
  ];

  for (const cad of cadFiles) {
    const oid = orderIds[cad.po];
    if (!oid) continue;
    const uid = require('crypto').randomUUID();
    const fp = `uploads/cad/${cad.po}/${cad.file}`;
    const notes = cad.notes.replace(/'/g, "''");
    const daysAgo = Math.floor(Math.random() * 20) + 1;
    const ts = new Date(Date.now() - daysAgo * 86400000).toISOString().replace('T', ' ').substring(0, 19);
    execSync(`${PSQL} -U jewelflow -d jewelflow -c "INSERT INTO cad_files (id,\\"orderId\\",\\"originalName\\",\\"fileName\\",\\"filePath\\",status,\\"uploadedBy\\",\\"revisionNumber\\",\\"designerNotes\\",\\"createdAt\\",\\"updatedAt\\") VALUES ('${uid}','${oid}','${cad.file}','${cad.file}','${fp}','${cad.status}','${CAD_ID}',${cad.rev},'${notes}','${ts}','${ts}');"`, { stdio: 'pipe' });
    console.log(`  + CAD: ${cad.po} rev${cad.rev} [${cad.status}]`);
  }

  // ── CONVERSATIONS ─────────────────────────────────────────────────────────
  console.log('\nCreating conversations...');

  function addMsg(oid, authorId, authorName, authorRole, content, isInternal, mentions = '') {
    if (!oid) return;
    const uid = require('crypto').randomUUID();
    const c = content.replace(/'/g, "''");
    const hoursAgo = Math.floor(Math.random() * 200) + 1;
    const ts = new Date(Date.now() - hoursAgo * 3600000).toISOString().replace('T', ' ').substring(0, 19);
    execSync(`${PSQL} -U jewelflow -d jewelflow -c "INSERT INTO order_messages (id,\\"orderId\\",\\"authorId\\",\\"authorName\\",\\"authorRole\\",content,\\"isInternal\\",mentions,\\"createdAt\\") VALUES ('${uid}','${oid}','${authorId}','${authorName}','${authorRole}','${c}',${isInternal},'${mentions}','${ts}');"`, { stdio: 'pipe' });
  }

  const conversations = [
    // KJ-TEST-001: Waiting confirmation - customer asks about rose gold option
    () => { const oid = orderIds['KJ-TEST-001']; const cId = cid(0); const cn = cname(0);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Hi! Just placed this order. Can you also show me a rose gold option in the CAD for comparison? My client might prefer that instead.', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Hi James! Absolutely, we will ask the CAD team to render both WG and RG options side by side. Should have the authorizer review this shortly.', false);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Checked specs - all looks good. Rose gold variation noted for CAD team. Authorizing now.', true, '@CAD_DESIGNER');
    },
    // KJ-TEST-002: Pendant height question
    () => { const oid = orderIds['KJ-TEST-002']; const cId = cid(1); const cn = cname(1);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Quick question - does the bezel setting add much to the overall height of the pendant? Want to make sure it sits flat against the neckline.', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Great question Priya. Standard bezel adds about 1.5 to 2mm to the profile. We can specify a low-profile bezel in the CAD to keep it flatter.', false);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'New order - simple pendant, low risk. Approved for CAD. @CAD_DESIGNER note: customer wants low-profile bezel.', true, '@CAD_DESIGNER');
    },
    // KJ-TEST-003: Stud earrings, customer sends reference
    () => { const oid = orderIds['KJ-TEST-003']; const cId = cid(2); const cn = cname(2);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Hi! I have sent the Instagram reference photo via DM. The setting should look exactly like that - very clean and minimal.', false);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Got the reference - clean 4-prong basket setting, round basket profile. @CAD_DESIGNER please match the basket depth from the reference closely.', true, '@CAD_DESIGNER');
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Reference received. I can replicate that style. Will have first renders up within 2 days.', true);
    },
    // KJ-TEST-004: CAD pending, customer follows up
    () => { const oid = orderIds['KJ-TEST-004']; const cId = cid(3); const cn = cname(3);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Authorized. @CAD_DESIGNER east-west orientation, knife-edge shank. No side stones, keep it clean.', true, '@CAD_DESIGNER');
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Got it. Starting on the east-west emerald today. Will have v1 up by tomorrow.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Hi! Any update on when I will see the first CAD? My client is very eager.', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Hi Sofia! Our CAD designer has it on today\'s queue. You should see the first render within 24 hours.', false);
    },
    // KJ-TEST-005: Pear pendant, internal discussion on chain loop
    () => { const oid = orderIds['KJ-TEST-005']; const cId = cid(4); const cn = cname(4);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Approved. @CAD_DESIGNER pear pendant with hidden halo. Yellow gold basket, white gold prongs. Fine chain loop at top.', true, '@CAD_DESIGNER');
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Any preference on chain loop diameter? Standard is 4mm inner diameter.', true);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Go with 5mm to fit thicker chains. Customer might use a thicker box chain.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Just checking in - when can I expect to see the first design?', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Hi David! We have it in the design queue and aim to have a first render ready within 48 hours.', false);
    },
    // KJ-TEST-006: Three-stone ring
    () => { const oid = orderIds['KJ-TEST-006']; const cId = cid(5); const cn = cname(5);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Three-stone approved. @CAD_DESIGNER standard cathedral shank. Side stones should be set slightly lower than center for the stepped effect.', true, '@CAD_DESIGNER');
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Understood. Will position side stones 0.5mm lower than center. Nice classic look.', true);
    },
    // KJ-TEST-007: Radiant halo, back and forth on band width
    () => { const oid = orderIds['KJ-TEST-007']; const cId = cid(6); const cn = cname(6);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Radiant halo v1 uploaded. Halo has 36 round pave stones, band is pave both sides for 2/3 of the shank.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Just reviewed the CAD - it looks stunning! One thing: can the band be slightly thinner? And is the halo gap uniform all around?', false);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Working on v2 now. Thinning band to 1.8mm and tightening the halo gap for uniformity. Ready by end of day.', true);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Good progress. @CAD_DESIGNER once v2 is approved let us fast-track to SKU since this customer has a deadline.', true, '@CAD_DESIGNER');
      addMsg(oid, cId, cn, 'CUSTOMER', 'Thank you for the quick turnaround! My client is excited. We will review v2 as soon as it is ready.', false);
    },
    // KJ-TEST-008: Tennis bracelet, box clasp request
    () => { const oid = orderIds['KJ-TEST-008']; const cId = cid(7); const cn = cname(7);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Tennis bracelet CAD sent for approval. 25 stones, 4-prong each, 7-inch length. Classic Tiffany-style spacing.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'The spacing looks perfect! One request: can the clasp be a box clasp instead of a lobster clasp? More secure for this value.', false);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Absolutely - box clasp is standard for tennis bracelets anyway. Updating the CAD now.', true);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Good catch. @CAD_DESIGNER please also note the box clasp specification in the production notes for factory.', true, '@CAD_DESIGNER');
    },
    // KJ-TEST-009: Princess solitaire, minimal back and forth
    () => { const oid = orderIds['KJ-TEST-009']; const cId = cid(8); const cn = cname(8);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Princess solitaire v1 ready for review. High cathedral, clean 2mm band as requested. Very elegant profile.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Just previewed it - it looks perfect. My client is going to love this. Waiting for the full approval walkthrough.', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Great Ahmed! We will send the full review link shortly so your client can see it from all angles.', false);
    },
    // KJ-TEST-010: Approved after 2nd revision
    () => { const oid = orderIds['KJ-TEST-010']; const cId = cid(9); const cn = cname(9);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Reviewed v1 - I love the overall shape but the split shank could be a bit wider apart. Can you open it up slightly?', false);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Absolutely - widening the split shank gap by 0.3mm. v2 coming shortly.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'v2 is perfect! The split shank looks elegant now. Approving this design. Please proceed to production.', false);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Customer approved v2. @SKU_MANAGER please assign SKU and move to production queue.', true, '@SKU_MANAGER');
      addMsg(oid, SKU_ID, 'Jake Morris', 'SKU_MANAGER', 'SKU assigned: CJ01010-14W. Moving to factory queue.', true);
    },
    // KJ-TEST-011: First-time approval
    () => { const oid = orderIds['KJ-TEST-011']; const cId = cid(10); const cn = cname(10);
      addMsg(oid, cId, cn, 'CUSTOMER', 'The CAD looks exactly like what I envisioned! Approving immediately. Please move forward as fast as possible.', false);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'First-time approval - always a pleasure! @SKU_MANAGER ready for you.', true, '@SKU_MANAGER');
      addMsg(oid, SKU_ID, 'Jake Morris', 'SKU_MANAGER', 'SKU assigned and queued for production.', true);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Great news Marco! Your order is approved and heading to production. Estimated 3 to 4 weeks.', false);
    },
    // KJ-TEST-012: Two-tone cushion halo approval
    () => { const oid = orderIds['KJ-TEST-012']; const cId = cid(11); const cn = cname(11);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Cushion halo v1 uploaded. Two-tone as requested: yellow gold basket, white gold for halo and shank.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'This looks beautiful! The two-tone contrast is exactly right. One tiny thing - can the halo stones be just slightly larger? Maybe 1.3mm instead of 1.1mm?', false);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Updated to 1.3mm halo stones in v2. This does affect the halo width slightly but looks even more impressive.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'v2 is stunning. Approved! My customer will be thrilled.', false);
    },
    // KJ-TEST-013: Rejected, needs full redesign
    () => { const oid = orderIds['KJ-TEST-013']; const cId = cid(12); const cn = cname(12);
      addMsg(oid, cId, cn, 'CUSTOMER', 'After showing my customer the halo design, they have completely changed their mind. They want a clean solitaire - no halo at all. I am sorry for the back and forth.', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'No problem at all Brianna! Design changes happen. We will have the CAD team start a fresh solitaire version.', false);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', '@CAD_DESIGNER KJ-TEST-013 customer changed to solitaire. Please redo the CAD from scratch - no halo. Keep same metal and stone.', true, '@CAD_DESIGNER');
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Understood. Fresh solitaire design - 4-prong head on a tapered shank. Will be faster this time.', true);
    },
    // KJ-TEST-014: Revision requested for pear earrings
    () => { const oid = orderIds['KJ-TEST-014']; const cId = cid(13); const cn = cname(13);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'Pear drop earrings uploaded. Prongs positioned for maximum visibility and security.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'I showed the CAD to my client and she noticed the prongs look a bit asymmetrical in the side view. Could you check if they are balanced?', false);
      addMsg(oid, CAD_ID, 'Maya Patel', 'CAD_DESIGNER', 'I see the issue - the rendering angle made one prong look off. Let me re-render from multiple angles and adjust if needed.', true);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Please fix the rendering AND confirm physical prong symmetry. Customer perception matters even if the file is technically correct.', true);
    },
    // KJ-TEST-015: SKU creation
    () => { const oid = orderIds['KJ-TEST-015']; const cId = cid(14); const cn = cname(14);
      addMsg(oid, SKU_ID, 'Jake Morris', 'SKU_MANAGER', 'Reviewing order for SKU assignment. Oval micropave band - cataloging as CJ01015-18W. Adding to product database.', true);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Great. @FACTORY_MANAGER heads up, this one will be coming to production queue shortly.', true, '@FACTORY_MANAGER');
    },
    // KJ-TEST-017: VPO issued
    () => { const oid = orderIds['KJ-TEST-017']; const cId = cid(16); const cn = cname(16);
      addMsg(oid, FACTORY_ID, 'Arjun Singh', 'FACTORY_MANAGER', 'VPO-40291 issued to Creations factory. Confirmed receipt from factory. Expected completion: 18 business days.', true);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Thanks Arjun. @FACTORY_MANAGER please flag immediately if there are any casting issues with the gold purity.', true, '@FACTORY_MANAGER');
      addMsg(oid, cId, cn, 'CUSTOMER', 'Hi! Just checking in - when do you expect the ring to be ready for my client?', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Hi Diane! Your order is in production at our factory. Expected completion is approximately 3.5 weeks from today.', false);
    },
    // KJ-TEST-019: Job bag, high-value piece
    () => { const oid = orderIds['KJ-TEST-019']; const cId = cid(18); const cn = cname(18);
      addMsg(oid, FACTORY_ID, 'Arjun Singh', 'FACTORY_MANAGER', 'Job bag JB-40280 created. Metal has been cast - 18K white gold came out clean. Stone setting begins next week.', true);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Excellent. This is a high-value piece. Please double-check cushion halo stone alignment before closing the job bag.', true);
      addMsg(oid, FACTORY_ID, 'Arjun Singh', 'FACTORY_MANAGER', 'Will do a full photo QC before sign-off. @SHIPPING_MANAGER heads up - this one needs extra care. 5.2ct cushion halo.', true, '@SHIPPING_MANAGER');
      addMsg(oid, SHIP_ID, 'Lisa Nguyen', 'SHIPPING_MANAGER', 'Thanks Arjun. Will prep double-box FedEx overnight with signature required on delivery.', true);
    },
    // KJ-TEST-020: Tennis bracelet in production
    () => { const oid = orderIds['KJ-TEST-020']; const cId = cid(19); const cn = cname(19);
      addMsg(oid, FACTORY_ID, 'Arjun Singh', 'FACTORY_MANAGER', 'Tennis bracelet production started. 25 individual settings being cast. RC Factory confirmed 10-day timeline.', true);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Good. Make sure the box clasp is sourced from our premium supplier - this is a $4100 piece.', true);
      addMsg(oid, FACTORY_ID, 'Arjun Singh', 'FACTORY_MANAGER', 'Confirmed, using Omega clasp supplier. Will meet the 10-day target.', true);
    },
    // KJ-TEST-023: Ready to ship authorization
    () => { const oid = orderIds['KJ-TEST-023']; const cId = cid(2); const cn = cname(2);
      addMsg(oid, SHIP_ID, 'Lisa Nguyen', 'SHIPPING_MANAGER', 'Order packaged and ready for dispatch. Ring box, appraisal certificate, and polishing cloth included. @AUTHORIZER please confirm dispatch authorization.', true, '@AUTHORIZER');
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Authorized for shipping. FedEx overnight as agreed with customer.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Just wanted to say my client is so excited to receive this! She has been counting down the days.', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'That is wonderful Carlos! Your order ships today and you will receive a FedEx tracking number by email shortly.', false);
    },
    // KJ-TEST-024: Ready to ship
    () => { const oid = orderIds['KJ-TEST-024']; const cId = cid(3); const cn = cname(3);
      addMsg(oid, SHIP_ID, 'Lisa Nguyen', 'SHIPPING_MANAGER', 'Oval bezel pendant packaged. Certificate of authenticity and appraisal enclosed. Ready for dispatch authorization.', true, '@AUTHORIZER');
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Approved for dispatch.', true);
    },
    // KJ-TEST-026: Shipped confirmation
    () => { const oid = orderIds['KJ-TEST-026']; const cId = cid(5); const cn = cname(5);
      addMsg(oid, SHIP_ID, 'Lisa Nguyen', 'SHIPPING_MANAGER', 'Dispatched via FedEx overnight. Tracking: 77312940298410. ETA tomorrow by 10:30am.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Received the FedEx tracking number - thank you! I can see it is out for delivery tomorrow morning.', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Perfect! Please let us know once it arrives and how your client reacts. We would love to see a photo.', false);
    },
    // KJ-TEST-027: UPS shipment
    () => { const oid = orderIds['KJ-TEST-027']; const cId = cid(6); const cn = cname(6);
      addMsg(oid, SHIP_ID, 'Lisa Nguyen', 'SHIPPING_MANAGER', 'Shipped UPS ground as per customer preference. Tracking: 1Z9V39W40394830428. 5-day delivery window.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Got the UPS notification. Works perfectly for us, the client is not in a rush.', false);
    },
    // KJ-TEST-029: Delivered, ecstatic customer
    () => { const oid = orderIds['KJ-TEST-029']; const cId = cid(8); const cn = cname(8);
      addMsg(oid, SHIP_ID, 'Lisa Nguyen', 'SHIPPING_MANAGER', 'Confirmed delivered via FedEx. Signature obtained at 11:23am.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Just received the ring - it is absolutely breathtaking. My client cried when she saw it. The craftsmanship is flawless. Thank you so much!', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Ahmed, this message made our whole team\'s day! We would love to feature this on our Instagram if your client is open to it.', false);
      addMsg(oid, cId, cn, 'CUSTOMER', 'She said yes! I will send photos later this week. Also she is already asking about a matching pendant - can we start a new order?', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Absolutely! I will have our design team reach out to discuss the matching pendant.', false);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Great customer, always smooth to work with. @SALES_REP flag this account for VIP treatment on next order.', true, '@SALES_REP');
    },
    // KJ-TEST-030: Delivered, repeat order
    () => { const oid = orderIds['KJ-TEST-030']; const cId = cid(9); const cn = cname(9);
      addMsg(oid, SHIP_ID, 'Lisa Nguyen', 'SHIPPING_MANAGER', 'Confirmed delivered via UPS. Signature obtained 10:14am.', true);
      addMsg(oid, cId, cn, 'CUSTOMER', 'Perfect delivery, exactly as expected. The emerald pendant is stunning. Our customer is already asking about a matching ring!', false);
      addMsg(oid, SALES_ID, 'Sarah Chen', 'SALES_REP', 'Wonderful news Laura! Glad it arrived perfectly. We would love to help with a matching ring - let us set up a call this week.', false);
      addMsg(oid, AUTH_ID, 'Raj Sharma', 'AUTHORIZER', 'Excellent outcome. This customer consistently places quality repeat orders. Mark as priority account.', true);
    },
  ];

  for (const convo of conversations) { convo(); }

  // Final count
  const msgCount = execSync(`${PSQL} -U jewelflow -d jewelflow -t -A -c "SELECT COUNT(*) FROM order_messages WHERE \\"orderId\\"::text IN (SELECT id::text FROM orders WHERE \\"poNumber\\" LIKE 'KJ-TEST-%');"`, { stdio: 'pipe' }).toString().trim();
  const cadCount = execSync(`${PSQL} -U jewelflow -d jewelflow -t -A -c "SELECT COUNT(*) FROM cad_files WHERE \\"orderId\\"::text IN (SELECT id::text FROM orders WHERE \\"poNumber\\" LIKE 'KJ-TEST-%');"`, { stdio: 'pipe' }).toString().trim();

  console.log('\n✅ Seed complete!');
  console.log(`   Customers: ${Object.keys(custIds).length}`);
  console.log(`   Orders:    ${Object.keys(orderIds).length}`);
  console.log(`   CAD files: ${cadCount}`);
  console.log(`   Messages:  ${msgCount}`);
  console.log('\nAll test customer logins: <email> / test123');
}

main().catch(console.error);
