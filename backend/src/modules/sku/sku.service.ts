import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sku } from '../../database/entities/sku.entity';
import { Order } from '../../database/entities/order.entity';

// First digit of SKU suffix = karat code
function karatCode(metalType?: string | null): string {
  if (!metalType) return 'X';
  const m = metalType.toLowerCase().trim();
  if (m.startsWith('10')) return '1';
  if (m.startsWith('14')) return '2';
  if (m.startsWith('18')) return '3';
  if (m.includes('platinum') || m.includes('plt')) return 'P';
  return 'X';
}

// Second digit of SKU suffix = color code
function colorCode(metalColor?: string | null): string {
  if (!metalColor) return 'X';
  const c = metalColor.toLowerCase().trim();
  if (c.includes('white')) return '1';
  if (c.includes('yellow')) return '2';
  if (c.includes('rose') || c.includes('pink')) return '3';
  return 'X';
}

// Extract the numeric part from a PO like "CO10613" or "KJ-2026-0001 (CO10479)" or "CO-00555"
function poDigits(poNumber: string): string {
  const m1 = poNumber.match(/^CO(\d+)$/);          // CO10613
  if (m1) return m1[1];
  const m2 = poNumber.match(/\(CO(\d+)\)/);         // KJ-2026-XXXX (CO10479)
  if (m2) return m2[1];
  const m3 = poNumber.match(/^CO-(\d+)$/);          // CO-00555
  if (m3) return m3[1];
  const m4 = poNumber.match(/^CR(\d+)$/);           // CR0045 repair
  if (m4) return `R${m4[1]}`;
  return '';
}

@Injectable()
export class SkuService {
  constructor(
    @InjectRepository(Sku) private readonly skuRepo: Repository<Sku>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  async generate(orderId: string, generatedBy?: string): Promise<Sku> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const digits = poDigits(order.poNumber);
    const suffix = `${karatCode(order.metalType)}${colorCode(order.metalColor)}`;
    // Repair orders (CR####) get CJR prefix; all others get CJ prefix
    const prefix = digits.startsWith('R') ? `CJR${digits.slice(1)}` : `CJ${digits}`;
    const skuNumber = digits ? `${prefix}-${suffix}` : `CJ-${suffix}`;

    const sku = this.skuRepo.create({
      skuNumber,
      orderId,
      orderType: order.orderType,
      metalType: order.metalType,
      metalColor: order.metalColor,
      centerStoneShape: order.centerStoneShape,
      approximateCaratWeight: order.approximateCaratWeight,
      generatedBy: generatedBy || 'system',
    });
    const saved = await this.skuRepo.save(sku);
    await this.orderRepo.update(orderId, { kiraSkuNumber: skuNumber });
    return saved;
  }
}
