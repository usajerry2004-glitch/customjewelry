"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = require("dotenv");
const path_1 = require("path");
dotenv.config({ path: (0, path_1.resolve)(__dirname, '../.env') });
const pg_1 = require("pg");
async function main() {
    const c = new pg_1.Client({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '5432'), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
    await c.connect();
    const res = await c.query(`SELECT email, role FROM users WHERE role NOT IN ('CUSTOMER') ORDER BY role`);
    res.rows.forEach(r => console.log(r.role.padEnd(20), r.email));
    await c.end();
}
main().catch(console.error);
//# sourceMappingURL=list-users.js.map