/**
 * Database Seed Script
 * Seeds initial data based on real Kira Jewels workflow
 * Run: npm run seed
 */

import { createConnection } from 'typeorm';

const ROLES = [
  { firstName: 'System', lastName: 'Admin', email: 'admin@jewelflow.com', role: 'ADMIN', passwordHash: 'Admin@1234' },
  { firstName: 'Sales', lastName: 'Rep', email: 'sales@jewelflow.com', role: 'SALES_REP', passwordHash: 'Sales@1234' },
  { firstName: 'CAD', lastName: 'Designer', email: 'cad@jewelflow.com', role: 'CAD_DESIGNER', passwordHash: 'CAD@1234' },
  { firstName: 'Factory', lastName: 'Manager', email: 'factory@jewelflow.com', role: 'FACTORY_MANAGER', passwordHash: 'Factory@1234' },
  { firstName: 'Stone', lastName: 'Manager', email: 'stone@jewelflow.com', role: 'STONE_MANAGER', passwordHash: 'Stone@1234' },
  { firstName: 'Shipping', lastName: 'Manager', email: 'shipping@jewelflow.com', role: 'SHIPPING_MANAGER', passwordHash: 'Ship@1234' },
  { firstName: 'US', lastName: 'Setter', email: 'setter@jewelflow.com', role: 'US_SETTER', passwordHash: 'Setter@1234' },
];

const SAMPLE_ORDERS = [
  {
    poNumber: 'CO-00330', kiraSkuNumber: 'CJ00330-22', status: 'SHIPPED',
    storeName: 'Vow and Vine', customerFullName: 'Vine', customerEmail: 'designer@vowandvinejewelry.com',
    orderType: 'Ring', size: '4.0', metalType: '14K', metalColor: 'YG-Yellow',
    diamondType: 'Lab', diamondQuality: 'F+VS+', quotedCost: 1160, vendorName: 'Creations',
    customerNotes: 'Please quote 14K Yellow Gold 11x9 mm Oval 1/2 CTW Lab-Grown Diamond Semi-Set Engagement Ring',
  },
  {
    poNumber: 'CO-00371', kiraSkuNumber: 'CJ00371-21', status: 'VPO_ISSUED',
    storeName: 'Sino Fine Jewelry', customerFullName: 'Tony Sino', customerEmail: 'tonysino@yahoo.com',
    orderType: 'Pendant', size: '16"', metalType: '14K', metalColor: 'WG-White',
    diamondType: 'Lab', diamondQuality: 'F+VS+', quotedCost: 4000, vendorName: 'Creations',
    customerNotes: '15 inch necklace. 0.25 ct each stones, oval only, Bezel set',
  },
  {
    poNumber: 'CO-00554', kiraSkuNumber: 'CJ00554-21', status: 'VPO_ISSUED',
    storeName: 'The Diamond Habit', customerFullName: 'Shelly Osadon', customerEmail: 'yash.s@kirajewels.one',
    orderType: 'Ring', size: '6.5', metalType: '14K', metalColor: 'WG-White',
    diamondType: 'Lab', diamondQuality: 'F+VS+', quotedCost: 2975, vendorName: 'Creations',
    customerNotes: 'Client needs the same ring as previous custom. ASAP delivery.',
  },
];

async function seed() {
  console.log('🌱 Starting database seed...');
  // In production: connect to DB and insert data
  console.log(`✅ Would seed ${ROLES.length} users and ${SAMPLE_ORDERS.length} sample orders`);
  console.log('📋 Demo credentials:');
  ROLES.forEach(r => console.log(`  ${r.role}: ${r.email} / ${r.passwordHash}`));
}

seed().catch(console.error);
