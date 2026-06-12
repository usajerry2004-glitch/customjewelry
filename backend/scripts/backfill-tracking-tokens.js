"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = require("dotenv");
const path_1 = require("path");
dotenv.config({ path: (0, path_1.resolve)(__dirname, '../.env') });
const crypto_1 = require("crypto");
const pg_1 = require("pg");
async function main() {
    const client = new pg_1.Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USERNAME || 'jewelflow',
        password: process.env.DB_PASSWORD || 'jewelflow123',
        database: process.env.DB_NAME || 'jewelflow',
    });
    await client.connect();
    console.log('Connected to database');
    const { rows } = await client.query(`SELECT id FROM orders WHERE "trackingToken" IS NULL`);
    if (rows.length === 0) {
        console.log('✓ All orders already have tracking tokens. Nothing to do.');
        await client.end();
        return;
    }
    console.log(`Found ${rows.length} orders without tracking tokens. Backfilling...`);
    let updated = 0;
    for (const row of rows) {
        const token = (0, crypto_1.randomBytes)(32).toString('hex');
        await client.query(`UPDATE orders SET "trackingToken" = $1 WHERE id = $2 AND "trackingToken" IS NULL`, [token, row.id]);
        updated++;
        if (updated % 50 === 0)
            console.log(`  ${updated}/${rows.length} done...`);
    }
    console.log(`✓ Backfilled ${updated} tracking tokens successfully.`);
    await client.end();
}
main().catch(err => {
    console.error('Backfill failed:', err.message);
    process.exit(1);
});
//# sourceMappingURL=backfill-tracking-tokens.js.map