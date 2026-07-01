/**
 * One-off: wipe all orders and everything that hangs off an orderId.
 *
 * orderId columns (cad_files, skus, notifications, order_events,
 * order_messages) aren't real FK relations, so deleting `orders` alone
 * would leave orphaned rows behind — this clears all of them together.
 *
 * Dry-run by default — prints row counts only. Pass --apply to delete.
 *
 * Run: npx ts-node src/database/seeds/clear-all-orders.ts [--apply]
 */
import { AppDataSource } from '../data-source';

const APPLY = process.argv.includes('--apply');

const CHILD_TABLES = ['cad_files', 'skus', 'notifications', 'order_events', 'order_messages'];

async function main() {
  await AppDataSource.initialize();
  console.log(APPLY ? '=== APPLY MODE — rows will be deleted ===' : '=== DRY RUN — no changes will be made (pass --apply to commit) ===');

  const [{ count: orderCount }] = await AppDataSource.query(`SELECT COUNT(*)::int AS count FROM orders`);
  console.log(`\norders: ${orderCount} row(s)`);

  for (const table of CHILD_TABLES) {
    const [{ count }] = await AppDataSource.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE "orderId" IS NOT NULL`,
    );
    console.log(`${table}: ${count} row(s) linked to an order`);
  }

  if (APPLY) {
    for (const table of CHILD_TABLES) {
      await AppDataSource.query(`DELETE FROM ${table} WHERE "orderId" IS NOT NULL`);
    }
    await AppDataSource.query(`DELETE FROM orders`);
    console.log('\nDone — all orders and related records deleted.');
  } else {
    console.log('\nDry run complete — re-run with --apply to actually delete these rows.');
  }

  await AppDataSource.destroy();
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
