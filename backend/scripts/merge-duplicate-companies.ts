import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env') });
import { Client } from 'pg';

// One-off: folds every company whose name is a case/whitespace-insensitive
// duplicate of another's into a single company, moving every teammate and
// their already-placed orders onto the surviving record — the same "adopt
// target company's name/rep, cascade to orders" logic used by the Customers
// page's "Add Existing Customer" merge action, just applied in bulk.
//
// Dry-run by default — prints exactly what it would do without writing
// anything. Pass --apply to actually perform the merges. Safe to re-run:
// once a group is merged there's only one company left with that name, so
// it no longer matches the duplicate-finding query.
//
// A group is skipped (never auto-merged) when:
//  - it's "Kira Jewels" — looks like internal/test accounts, not a real
//    customer, so merging is a judgment call for a human.
//  - its companies disagree on which Sales Rep is assigned — silently
//    picking one could misattribute a rep's book of business.
const APPLY = process.argv.includes('--apply');

async function main() {
  const c = new Client({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  await c.connect();
  console.log(APPLY ? 'APPLY mode — writes will happen.\n' : 'DRY-RUN mode — no writes will happen. Pass --apply to execute.\n');

  const { rows: groups } = await c.query(`
    SELECT lower(trim(name)) AS norm_name, array_agg(id) AS ids
    FROM companies
    GROUP BY lower(trim(name))
    HAVING count(*) > 1
    ORDER BY norm_name ASC
  `);

  let merged = 0;
  const skipped: string[] = [];

  for (const g of groups) {
    if (g.norm_name === 'kira jewels') {
      skipped.push(`"${g.norm_name}" — internal/test accounts, review manually`);
      continue;
    }

    const { rows: companies } = await c.query(
      `SELECT id, name, "salesRepId", "createdAt" FROM companies WHERE id = ANY($1) ORDER BY "createdAt" ASC`,
      [g.ids],
    );

    const repIds = [...new Set(companies.map((co: any) => co.salesRepId).filter(Boolean))];
    if (repIds.length > 1) {
      skipped.push(`"${companies[0].name}" (${companies.length} companies) — different Sales Reps assigned, review manually`);
      continue;
    }

    // Keep whichever company already has a Sales Rep; otherwise the oldest.
    const primary = companies.find((co: any) => co.salesRepId) || companies[0];
    const secondaries = companies.filter((co: any) => co.id !== primary.id);

    let repPatch = { salesRepId: null as string | null, salesRepName: null as string | null, salesRepEmail: null as string | null };
    if (primary.salesRepId) {
      const { rows: [rep] } = await c.query(`SELECT "firstName", "lastName", email FROM users WHERE id = $1`, [primary.salesRepId]);
      if (rep) repPatch = { salesRepId: primary.salesRepId, salesRepName: `${rep.firstName} ${rep.lastName}`.trim(), salesRepEmail: rep.email };
    }

    console.log(`MERGE "${primary.name}" — keeping ${primary.id}, folding in ${secondaries.map((s: any) => s.id).join(', ')}`);

    for (const sec of secondaries) {
      const { rows: users } = await c.query(`SELECT id, email FROM users WHERE "companyId" = $1`, [sec.id]);
      console.log(`   moving ${users.length} account(s): ${users.map((u: any) => u.email).join(', ') || '(none)'}`);

      if (APPLY) {
        await c.query(
          `UPDATE users SET "companyId" = $1, "storeName" = $2, "salesRepId" = $3 WHERE "companyId" = $4`,
          [primary.id, primary.name, repPatch.salesRepId, sec.id],
        );
        for (const u of users) {
          await c.query(
            `UPDATE orders SET "companyId" = $1, "storeName" = $2, "salesRepId" = $3, "salesRepName" = $4, "salesRepEmail" = $5 WHERE "customerId" = $6`,
            [primary.id, primary.name, repPatch.salesRepId, repPatch.salesRepName, repPatch.salesRepEmail, u.id],
          );
          await c.query(
            `UPDATE orders SET "companyId" = $1, "storeName" = $2, "salesRepId" = $3, "salesRepName" = $4, "salesRepEmail" = $5 WHERE "customerEmail" = $6`,
            [primary.id, primary.name, repPatch.salesRepId, repPatch.salesRepName, repPatch.salesRepEmail, u.email],
          );
        }
        await c.query(`DELETE FROM companies WHERE id = $1`, [sec.id]);
      }
    }
    merged++;
  }

  console.log(`\n${APPLY ? 'Merged' : 'Would merge'}: ${merged} group(s).`);
  if (skipped.length) {
    console.log(`Skipped (needs manual review):`);
    skipped.forEach(s => console.log(`  - ${s}`));
  }
  await c.end();
}
main().catch(console.error);
