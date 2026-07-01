/**
 * One-off cleanup for the SKU_MANAGER role / SKU_CREATION status removal.
 *
 * These two enum values no longer exist in the code, but the `status`/`role`
 * columns are plain varchar, so any pre-existing rows with the old string
 * values are just silently invisible to the app (they match no filter, no
 * transition, nothing). This script finds them and moves them into the new
 * model:
 *
 *   - Orders with status = 'SKU_CREATION' → SKU is generated (if missing)
 *     and the order is moved to VPO_ISSUED, matching what the new
 *     auto-generate-on-approval flow would have done.
 *   - Users with role = 'SKU_MANAGER' → deactivated (isActive = false).
 *     Their account/history is left intact; they're just logged out of a
 *     role that no longer exists in the RBAC model.
 *
 * Dry-run by default — prints what it *would* do. Pass --apply to commit.
 *
 * Run: npx ts-node src/database/seeds/cleanup-sku-role-removal.ts [--apply]
 */
import { AppDataSource } from '../data-source';

const APPLY = process.argv.includes('--apply');

function karatCode(metalType?: string | null): string {
  if (!metalType) return 'X';
  const m = metalType.toLowerCase().trim();
  if (m.startsWith('10')) return '1';
  if (m.startsWith('14')) return '2';
  if (m.startsWith('18')) return '3';
  if (m.includes('platinum') || m.includes('plt')) return 'P';
  return 'X';
}

function colorCode(metalColor?: string | null): string {
  if (!metalColor) return 'X';
  const c = metalColor.toLowerCase().trim();
  if (c.includes('white')) return '1';
  if (c.includes('yellow')) return '2';
  if (c.includes('rose') || c.includes('pink')) return '3';
  return 'X';
}

function poDigits(poNumber: string): string {
  const m1 = poNumber.match(/^CO(\d+)$/);
  if (m1) return m1[1];
  const m2 = poNumber.match(/\(CO(\d+)\)/);
  if (m2) return m2[1];
  const m3 = poNumber.match(/^CO-(\d+)$/);
  if (m3) return m3[1];
  const m4 = poNumber.match(/^CR(\d+)$/);
  if (m4) return `R${m4[1]}`;
  return '';
}

function buildSkuNumber(order: { poNumber: string; metalType?: string | null; metalColor?: string | null }): string {
  const digits = poDigits(order.poNumber);
  const suffix = `${karatCode(order.metalType)}${colorCode(order.metalColor)}`;
  const prefix = digits.startsWith('R') ? `CJR${digits.slice(1)}` : `CJ${digits}`;
  return digits ? `${prefix}-${suffix}` : `CJ-${suffix}`;
}

async function main() {
  await AppDataSource.initialize();
  console.log(APPLY ? '=== APPLY MODE — changes will be committed ===' : '=== DRY RUN — no changes will be made (pass --apply to commit) ===');

  // ── Orders stuck in SKU_CREATION ────────────────────────────────────────
  const staleOrders: any[] = await AppDataSource.query(
    `SELECT id, "poNumber", "kiraSkuNumber", "metalType", "metalColor" FROM orders WHERE status = 'SKU_CREATION'`,
  );
  console.log(`\nFound ${staleOrders.length} order(s) with status = SKU_CREATION`);

  for (const order of staleOrders) {
    if (order.kiraSkuNumber) {
      console.log(`  - ${order.poNumber}: already has SKU ${order.kiraSkuNumber} → moving to VPO_ISSUED`);
      if (APPLY) {
        await AppDataSource.query(`UPDATE orders SET status = 'VPO_ISSUED' WHERE id = $1`, [order.id]);
      }
      continue;
    }

    const skuNumber = buildSkuNumber(order);
    console.log(`  - ${order.poNumber}: generating SKU ${skuNumber} → moving to VPO_ISSUED`);
    if (APPLY) {
      const existing = await AppDataSource.query(`SELECT id FROM skus WHERE "skuNumber" = $1`, [skuNumber]);
      if (existing.length === 0) {
        await AppDataSource.query(
          `INSERT INTO skus (id, "skuNumber", "orderId", "orderType", "metalType", "metalColor", "centerStoneShape", "approximateCaratWeight", "generatedBy", "isActive", "createdAt", "updatedAt")
           SELECT gen_random_uuid(), $1, id, "orderType", "metalType", "metalColor", "centerStoneShape", "approximateCaratWeight", 'cleanup-script', true, now(), now()
           FROM orders WHERE id = $2`,
          [skuNumber, order.id],
        );
      }
      await AppDataSource.query(
        `UPDATE orders SET "kiraSkuNumber" = $1, status = 'VPO_ISSUED' WHERE id = $2`,
        [skuNumber, order.id],
      );
    }
  }

  // ── Users still holding the SKU_MANAGER role ────────────────────────────
  const staleUsers: any[] = await AppDataSource.query(
    `SELECT id, email, "firstName", "lastName", "isActive" FROM users WHERE role = 'SKU_MANAGER'`,
  );
  console.log(`\nFound ${staleUsers.length} user(s) with role = SKU_MANAGER`);

  for (const user of staleUsers) {
    console.log(`  - ${user.email} (${user.firstName} ${user.lastName}) → deactivating`);
    if (APPLY) {
      await AppDataSource.query(`UPDATE users SET "isActive" = false WHERE id = $1`, [user.id]);
    }
  }

  await AppDataSource.destroy();
  console.log(APPLY ? '\nDone — changes committed.' : '\nDry run complete — re-run with --apply to commit these changes.');
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
