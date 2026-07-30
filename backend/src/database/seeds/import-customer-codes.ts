/**
 * Import the RightClick customer code/name list into customer_codes.
 * Upserts on `code`, so re-running is safe if the source list is refreshed.
 *
 * Requires the customer_codes table to already exist — start the app once
 * (synchronize: true creates it) before running this.
 *
 * Run: npx ts-node src/database/seeds/import-customer-codes.ts
 */
import { join } from 'path';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { AppDataSource } from '../data-source';

const CSV_PATH = join(__dirname, 'data/rightclick-customers.csv');

async function main() {
  const workbook = XLSX.readFile(CSV_PATH, { raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const seen = new Set<string>();
  const entries: { code: string; name: string }[] = [];
  for (const row of rows.slice(1)) {
    const code = String(row[0] ?? '').trim();
    const name = String(row[1] ?? '').trim();
    if (!code || !name) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    entries.push({ code, name });
  }

  console.log(`Parsed ${entries.length} customer code/name rows from ${CSV_PATH}`);

  await AppDataSource.initialize();

  let inserted = 0;
  let updated = 0;
  for (const { code, name } of entries) {
    const result = await AppDataSource.query(
      `INSERT INTO customer_codes (id, code, name, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = now()
       RETURNING (xmax = 0) AS inserted`,
      [randomUUID(), code, name],
    );
    if (result[0]?.inserted) inserted++; else updated++;
  }

  console.log(`Done — ${inserted} inserted, ${updated} updated.`);
  await AppDataSource.destroy();
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
