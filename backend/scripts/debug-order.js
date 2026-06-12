"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = require("dotenv");
const path_1 = require("path");
dotenv.config({ path: (0, path_1.resolve)(__dirname, '../.env') });
const pg_1 = require("pg");
async function main() {
    const c = new pg_1.Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    await c.connect();
    const order = await c.query(`SELECT id, "poNumber", status, "cadSubStatus", "sentToCustomer", "customerEmail" FROM orders WHERE "poNumber" = $1`, ['KJ-2026-0721']);
    console.log('ORDER:', JSON.stringify(order.rows[0], null, 2));
    if (order.rows[0]) {
        const cads = await c.query(`SELECT id, "orderId", "originalName", "fileName", "filePath", status, "revisionNumber", "uploadedBy", "createdAt", "designerNotes" FROM cad_files WHERE "orderId" = $1 ORDER BY "createdAt" ASC`, [order.rows[0].id]);
        console.log(`\nCAD FILES (${cads.rows.length} total):`);
        cads.rows.forEach((r, i) => console.log(`  [${i + 1}]`, JSON.stringify(r, null, 4)));
        const fs = require('fs');
        for (const row of cads.rows) {
            const exists = fs.existsSync(row.filePath);
            console.log(`  File on disk [${row.fileName}]: ${exists ? 'EXISTS' : 'MISSING'} — ${row.filePath}`);
        }
    }
    await c.end();
}
main().catch(err => { console.error(err.message); process.exit(1); });
//# sourceMappingURL=debug-order.js.map