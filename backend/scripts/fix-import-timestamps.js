/**
 * One-time script: backdate createdAt on Smartsheet-imported orders to the
 * Smartsheet row's actual creation date instead of today.
 *
 * Run: node scripts/fix-import-timestamps.js
 */

const { Client } = require('pg');
const https = require('https');

const SHEET_ID = '2085580205674372';
const SM_TOKEN = 'JCFp5W0qw1NOlPcSPdpLSGNHbjiPChumqo8Es';

const DB = {
  host: 'localhost', port: 5432,
  user: 'jewelflow', password: 'jewelflow123', database: 'jewelflow',
};

function smGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.smartsheet.com',
      path: `/2.0${path}`,
      headers: { Authorization: `Bearer ${SM_TOKEN}`, 'Content-Type': 'application/json' },
    };
    https.get(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching Smartsheet rows...');
  const sheet = await smGet(`/sheets/${SHEET_ID}`);
  const rows = sheet.rows || [];
  console.log(`Got ${rows.length} rows from Smartsheet`);

  const client = new Client(DB);
  await client.connect();

  // Build map: smartsheetRowId → createdAt
  const rowMap = {};
  for (const row of rows) {
    if (row.id && row.createdAt) {
      rowMap[String(row.id)] = new Date(row.createdAt);
    }
  }

  // Find all orders imported today that have a smartsheetRowId
  const res = await client.query(
    `SELECT id, "poNumber", "smartsheetRowId" FROM orders
     WHERE "createdAt"::date = current_date AND "smartsheetRowId" IS NOT NULL`
  );

  console.log(`Found ${res.rows.length} orders to fix`);
  let fixed = 0, missing = 0;

  for (const order of res.rows) {
    const smDate = rowMap[order.smartsheetRowId];
    if (!smDate) { missing++; continue; }
    await client.query(
      `UPDATE orders SET "createdAt" = $1 WHERE id = $2`,
      [smDate, order.id]
    );
    fixed++;
  }

  await client.end();
  console.log(`\nDone — fixed: ${fixed}, missing Smartsheet date: ${missing}`);
}

main().catch(e => { console.error(e); process.exit(1); });
