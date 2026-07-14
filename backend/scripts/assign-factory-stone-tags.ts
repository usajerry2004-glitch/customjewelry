import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env') });
import { Client } from 'pg';

// One-off: tags the existing Gaurav (Factory Manager) and Neil (Stone Manager)
// accounts with their factory/supply-source assignment. Run once, after the
// backend has been restarted at least once so TypeORM's synchronize has added
// the assignedFactory/assignedSupplySource columns.
async function main() {
  const c = new Client({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  await c.connect();

  const gaurav = await c.query(
    `UPDATE users SET "assignedFactory" = 'CREATIONS' WHERE email = 'gaurav@creationjewel.co.in' RETURNING email, role, "assignedFactory"`,
  );
  console.log('Gaurav:', gaurav.rows[0] || 'not found');

  const neil = await c.query(
    `UPDATE users SET "assignedSupplySource" = 'KIRA' WHERE email = 'neil.k@kiradiam.com' RETURNING email, role, "assignedSupplySource"`,
  );
  console.log('Neil:', neil.rows[0] || 'not found');

  await c.end();
}
main().catch(console.error);
