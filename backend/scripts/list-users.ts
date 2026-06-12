import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env') });
import { Client } from 'pg';
async function main() {
  const c = new Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432'), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  await c.connect();
  const res = await c.query(`SELECT email, role FROM users WHERE role NOT IN ('CUSTOMER') ORDER BY role`);
  res.rows.forEach(r => console.log(r.role.padEnd(20), r.email));
  await c.end();
}
main().catch(console.error);
