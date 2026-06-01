import { createConnection } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { User } from '../entities/user.entity';

const testOrders = [
  {
    poNumber: 'KJ-SALES1-001',
    storeName: 'Downtown Jewelry',
    customerFullName: 'John Anderson',
    customerEmail: 'john.anderson@customer.com',
    salesRepEmail: 'sales@kirajewels.one',
    orderType: 'Engagement Ring',
    metalType: 'Platinum',
    metalColor: 'White',
    diamondType: 'Round Brilliant',
    diamondQuality: 'VS1',
    centerStoneShape: 'Round',
    approximateCaratWeight: '1.5 ct',
    customerNotes: 'Wants a simple band with side stones',
    quotedCost: 4500,
    status: OrderStatus.WAITING_CONFIRMATION,
  },
  {
    poNumber: 'KJ-SALES1-002',
    storeName: 'Fashion Accessories Inc',
    customerFullName: 'Amanda Martinez',
    customerEmail: 'amanda.martinez@customer.com',
    salesRepEmail: 'sales@kirajewels.one',
    orderType: 'Pendant',
    metalType: 'Yellow Gold',
    metalColor: '14k',
    diamondType: 'Round',
    diamondQuality: 'SI1',
    centerStoneShape: 'Cushion',
    approximateCaratWeight: '0.75 ct',
    customerNotes: 'Gold pendant with diamond',
    quotedCost: 2800,
    status: OrderStatus.PENDING_CAD,
  },
  {
    poNumber: 'KJ-SALES2-001',
    storeName: 'Luxury Designs',
    customerFullName: 'David Brown',
    customerEmail: 'david.brown@customer.com',
    salesRepEmail: 'sales2@kirajewels.one',
    orderType: 'Wedding Band',
    metalType: 'White Gold',
    metalColor: '18k',
    diamondType: 'Baguette',
    diamondQuality: 'VVS1',
    centerStoneShape: 'Baguette',
    approximateCaratWeight: '0.5 ct',
    customerNotes: 'Band with side baguette diamonds',
    quotedCost: 3200,
    status: OrderStatus.WAITING_CONFIRMATION,
  },
  {
    poNumber: 'KJ-SALES2-002',
    storeName: 'Elite Collections',
    customerFullName: 'John Anderson',
    customerEmail: 'john.anderson@customer.com',
    salesRepEmail: 'sales2@kirajewels.one',
    orderType: 'Bracelet',
    metalType: 'Rose Gold',
    metalColor: '14k',
    diamondType: 'Round',
    diamondQuality: 'VS2',
    centerStoneShape: 'Round',
    approximateCaratWeight: '2.0 ct',
    customerNotes: 'Tennis bracelet with rose gold',
    quotedCost: 5800,
    status: OrderStatus.CAD_IN_PROGRESS,
  },
  {
    poNumber: 'KJ-SALES3-001',
    storeName: 'Prestige Jewelers',
    customerFullName: 'Amanda Martinez',
    customerEmail: 'amanda.martinez@customer.com',
    salesRepEmail: 'sales3@kirajewels.one',
    orderType: 'Earrings',
    metalType: 'Platinum',
    metalColor: 'White',
    diamondType: 'Round',
    diamondQuality: 'IF',
    centerStoneShape: 'Round',
    approximateCaratWeight: '1.0 ct',
    customerNotes: 'Stud earrings - pair',
    quotedCost: 6500,
    status: OrderStatus.CUSTOMER_APPROVED,
  },
  {
    poNumber: 'KJ-SALES1-003',
    storeName: 'Grand Boutique',
    customerFullName: 'David Brown',
    customerEmail: 'david.brown@customer.com',
    salesRepEmail: 'sales@kirajewels.one',
    orderType: 'Ring',
    metalType: 'Yellow Gold',
    metalColor: '18k',
    diamondType: 'Oval',
    diamondQuality: 'VS1',
    centerStoneShape: 'Oval',
    approximateCaratWeight: '2.2 ct',
    customerNotes: 'Oval stone with halo setting',
    quotedCost: 8900,
    status: OrderStatus.SKU_CREATION,
  },
  {
    poNumber: 'KJ-SALES2-003',
    storeName: 'Crystal Palace',
    customerFullName: 'John Anderson',
    customerEmail: 'john.anderson@customer.com',
    salesRepEmail: 'sales2@kirajewels.one',
    orderType: 'Necklace',
    metalType: 'White Gold',
    metalColor: '14k',
    diamondType: 'Round',
    diamondQuality: 'VS1',
    centerStoneShape: 'Round',
    approximateCaratWeight: '0.5 ct',
    customerNotes: 'Delicate pendant necklace',
    quotedCost: 2200,
    status: OrderStatus.VPO_ISSUED,
  },
  {
    poNumber: 'KJ-SALES3-002',
    storeName: 'Royal Gems',
    customerFullName: 'Amanda Martinez',
    customerEmail: 'amanda.martinez@customer.com',
    salesRepEmail: 'sales3@kirajewels.one',
    orderType: 'Ring',
    metalType: 'Rose Gold',
    metalColor: '18k',
    diamondType: 'Cushion',
    diamondQuality: 'VVS2',
    centerStoneShape: 'Cushion',
    approximateCaratWeight: '1.8 ct',
    customerNotes: 'Cushion cut with twisted band',
    quotedCost: 7200,
    status: OrderStatus.SHIPPED,
  },
];

async function seedOrders() {
  const connection = await createConnection({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'jewelflow',
    password: process.env.DB_PASSWORD || 'jewelflow123',
    database: process.env.DB_NAME || 'kira_custom_jewelry',
    entities: [Order, User],
    synchronize: false,
  });

  try {
    const userRepo = connection.getRepository(User);
    const orderRepo = connection.getRepository(Order);

    for (const orderData of testOrders) {
      // Find the sales rep
      const salesRep = await userRepo.findOne({
        where: { email: orderData.salesRepEmail },
      });

      if (!salesRep) {
        console.log(`Sales rep ${orderData.salesRepEmail} not found, skipping order`);
        continue;
      }

      // Check if order already exists
      const exists = await orderRepo.findOne({
        where: { poNumber: orderData.poNumber },
      });

      if (exists) {
        console.log(`Order ${orderData.poNumber} already exists, skipping`);
        continue;
      }

      // Create order
      const order = orderRepo.create({
        ...orderData,
        salesRepId: salesRep.id,
      });

      await orderRepo.save(order);
      console.log(`✓ Created order ${orderData.poNumber} for ${salesRep.email}`);
    }

    console.log('\n✓ All test orders created successfully!');
  } catch (error) {
    console.error('Error seeding orders:', error);
  } finally {
    await connection.close();
  }
}

seedOrders();
