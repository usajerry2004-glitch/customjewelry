import { createConnection } from 'typeorm';
import { User } from '../entities/user.entity';

(async () => {
  try {
    const conn = await createConnection({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'jewelflow',
      password: 'jewelflow123',
      database: 'jewelflow',
      entities: [User],
      synchronize: false,
    });

    const newUsers = await conn.getRepository(User).find({
      where: [
        { email: 'sales2@kirajewels.one' },
        { email: 'sales3@kirajewels.one' },
        { email: 'john.anderson@customer.com' },
        { email: 'amanda.martinez@customer.com' },
        { email: 'david.brown@customer.com' },
      ],
    });

    console.log('\n========== NEW USERS - COMPLETE CREDENTIALS ==========\n');

    const passwords: any = {
      'sales2@kirajewels.one': 'KiRa@Sales2#2025!',
      'sales3@kirajewels.one': 'KiRa@Sales3#2025!',
      'john.anderson@customer.com': 'KiRa@Cust1#2025!',
      'amanda.martinez@customer.com': 'KiRa@Cust2#2025!',
      'david.brown@customer.com': 'KiRa@Cust3#2025!',
    };

    newUsers.forEach(u => {
      console.log(`Name: ${u.firstName} ${u.lastName}`);
      console.log(`Email: ${u.email}`);
      console.log(`User ID: ${u.id}`);
      console.log(`Role: ${u.role}`);
      console.log(`Password: ${passwords[u.email]}`);
      console.log('-------------------------------------------');
    });

    console.log('\n');
    await conn.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
