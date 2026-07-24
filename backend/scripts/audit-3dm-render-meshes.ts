// One-off diagnostic: scans every uploaded .3dm CAD file for the C00070
// failure mode — a file saved as pure NURBS/Brep with no render mesh baked
// in, which the customer portal's WebGL viewer can only show as a blank
// canvas + error. Upload of new files is now blocked at the source (see
// src/modules/cad/render-mesh-check.util.ts), but this finds any file that
// already slipped through before that check existed, so the CAD team can
// re-export and re-upload it before a customer hits the same error.
//
// Read-only — does not modify the database or any files. Run with:
//   npx ts-node scripts/audit-3dm-render-meshes.ts
// Against production, run it through Railway so it picks up prod env vars:
//   railway run npx ts-node scripts/audit-3dm-render-meshes.ts
import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(__dirname, '../.env') });

import { Client } from 'pg';
import { checkRenderMesh } from '../src/modules/cad/render-mesh-check.util';

async function main() {
  const c = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await c.connect();

  const { rows } = await c.query(`
    SELECT cf.id, cf."orderId", o."poNumber", cf."originalName", cf."filePath",
           cf.status, cf."revisionNumber", cf."createdAt"
    FROM cad_files cf
    JOIN orders o ON o.id = cf."orderId"
    WHERE cf."originalName" ILIKE '%.3dm'
    ORDER BY cf."createdAt" DESC
  `);

  console.log(`Checking ${rows.length} .3dm file(s)...\n`);

  const broken: any[] = [];
  for (const row of rows) {
    try {
      const res = await fetch(row.filePath);
      if (!res.ok) {
        console.log(`[SKIP] ${row.poNumber} — ${row.originalName}: could not fetch (HTTP ${res.status})`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const check = await checkRenderMesh(buffer);
      if (!check.parsed || check.meshCount === 0) {
        broken.push({ ...row, ...check });
        console.log(`[BROKEN] ${row.poNumber} — "${row.originalName}" (rev ${row.revisionNumber}, ${row.status}) — ` +
          (check.parsed ? `${check.objectCount} objects, 0 render meshes` : 'failed to parse'));
      }
    } catch (e: any) {
      console.log(`[ERROR] ${row.poNumber} — ${row.originalName}: ${e.message}`);
    }
  }

  console.log(`\n${broken.length} of ${rows.length} file(s) have no viewable render mesh.`);
  if (broken.length > 0) {
    console.log('Affected orders:', [...new Set(broken.map(b => b.poNumber))].join(', '));
  }

  await c.end();
}

main().catch(err => { console.error(err); process.exit(1); });
