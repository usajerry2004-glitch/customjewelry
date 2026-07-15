import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env') });
import { Client } from 'pg';
import { randomUUID } from 'crypto';

// One-off: every existing Customer account predates the companies table, so
// each gets its own standalone Company row (seeded from their storeName),
// and their historical orders get backfilled with that companyId. Safe to
// re-run — only touches customers that don't have a companyId yet. Run once
// after the backend has restarted at least once (so TypeORM's synchronize
// has created the companies table and the companyId columns).
async function main() {
  const c = new Client({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();

  const { rows: customers } = await c.query(
    `SELECT id, "firstName", "lastName", email, "storeName", "salesRepId"
     FROM users WHERE role = 'CUSTOMER' AND "companyId" IS NULL`,
  );
  console.log(`Found ${customers.length} customer(s) with no company yet.`);

  for (const cust of customers) {
    const companyId = randomUUID();
    const name = (cust.storeName && cust.storeName.trim())
      || `${cust.firstName || ''} ${cust.lastName || ''}`.trim()
      || cust.email;

    await c.query(
      `INSERT INTO companies (id, name, "salesRepId", "createdAt") VALUES ($1, $2, $3, now())`,
      [companyId, name, cust.salesRepId || null],
    );
    await c.query(`UPDATE users SET "companyId" = $1 WHERE id = $2`, [companyId, cust.id]);
    const { rowCount } = await c.query(
      `UPDATE orders SET "companyId" = $1 WHERE "customerId" = $2 OR "customerEmail" = $3`,
      [companyId, cust.id, cust.email],
    );
    console.log(`  ${cust.email} → company "${name}" (${companyId}) — ${rowCount} order(s) backfilled`);
  }

  console.log('Done.');
  await c.end();
}
main().catch(console.error);
