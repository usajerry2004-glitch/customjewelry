import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sku } from '../../database/entities/sku.entity';
import { Order, OrderStatus } from '../../database/entities/order.entity';

const TYPE_CODES: Record<string, string> = {
  'Engagement Ring': 'RING',
  'Wedding Band': 'BAND',
  'Necklace': 'NECK',
  'Pendant': 'PEND',
  'Bracelet': 'BRAC',
  'Earrings': 'EARR',
  'Brooch': 'BRCH',
  'Ring': 'RING',
};

const METAL_CODES: Record<string, string> = {
  '18K': '18K',
  '14K': '14K',
  '10K': '10K',
  'Platinum': 'PLT',
  'Sterling Silver': 'SS',
};

const COLOR_CODES: Record<string, string> = {
  'White Gold': 'WG',
  'Yellow Gold': 'YG',
  'Rose Gold': 'RG',
  'Platinum': 'PT',
};

@Injectable()
export class SkuService {
  constructor(
    @InjectRepository(Sku) private readonly skuRepo: Repository<Sku>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  async generate(orderId: string, generatedBy?: string): Promise<Sku> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const typeCode = TYPE_CODES[order.orderType || ''] || 'ITEM';
    const metalCode = METAL_CODES[order.metalType || ''] || 'MET';
    const colorCode = COLOR_CODES[order.metalColor || ''] || 'XX';
    const count = await this.skuRepo.count();
    const seq = String(count + 1).padStart(4, '0');

    const skuNumber = `KJ-${typeCode}-${metalCode}${colorCode}-${seq}`;

    const sku = this.skuRepo.create({
      skuNumber,
      orderId,
      orderType: order.orderType,
      metalType: order.metalType,
      metalColor: order.metalColor,
      centerStoneShape: order.centerStoneShape,
      approximateCaratWeight: order.approximateCaratWeight,
      generatedBy: generatedBy || 'sku-manager@kirajewels.one',
    });
    const saved = await this.skuRepo.save(sku);
    await this.orderRepo.update(orderId, { kiraSkuNumber: skuNumber, status: OrderStatus.SKU_CREATION });
    return saved;
  }

  async findAll(search?: string): Promise<Sku[]> {
    const qb = this.skuRepo.createQueryBuilder('s').where('s.isActive = :a', { a: true });
    if (search) {
      qb.andWhere('(s.skuNumber LIKE :q OR s.orderType LIKE :q)', { q: `%${search}%` });
    }
    return qb.orderBy('s.createdAt', 'DESC').getMany();
  }

  async findOne(id: string): Promise<Sku> {
    const sku = await this.skuRepo.findOne({ where: { id } });
    if (!sku) throw new NotFoundException(`SKU ${id} not found`);
    return sku;
  }
}
