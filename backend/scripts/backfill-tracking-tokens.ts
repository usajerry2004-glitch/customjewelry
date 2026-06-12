/**
 * Run once to backfill trackingToken for orders created before the token column was added.
 * Usage:  npx ts-node -r tsconfig-paths/register scripts/backfill-tracking-tokens.ts
 */
import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env') });

import { randomBytes } from 'crypto';
import { Client } from 'pg';

async function main() {
  const client = new Client({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    user:     process.env.DB_USERNAME || 'jewelflow',
    password: process.env.DB_PASSWORD || 'jewelflow123',
    database: process.env.DB_NAME     || 'jewelflow',
  });

  await client.connect();
  console.log('Connected to database');

  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM orders WHERE "trackingToken" IS NULL`,
  );

  if (rows.length === 0) {
    console.log('✓ All orders already have tracking tokens. Nothing to do.');
    await client.end();
    return;
  }

  console.log(`Found ${rows.length} orders without tracking tokens. Backfilling...`);

  let updated = 0;
  for (const row of rows) {
    const token = randomBytes(32).toString('hex');
    await client.query(
      `UPDATE orders SET "trackingToken" = $1 WHERE id = $2 AND "trackingToken" IS NULL`,
      [token, row.id],
    );
    updated++;
    if (updated % 50 === 0) console.log(`  ${updated}/${rows.length} done...`);
  }

  console.log(`✓ Backfilled ${updated} tracking tokens successfully.`);
  await client.end();
}

main().catch(err => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
