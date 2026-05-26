import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Order } from '../../database/entities/order.entity';

@Injectable()
export class SummaryService {
  private anthropic: Anthropic;

  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
  ) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async getSummary(orderId: string): Promise<{ summary: string }> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.aiSummary) return { summary: order.aiSummary };

    const prompt = `You are reviewing a custom jewelry order for an authorizer at Kira Jewels. Write a concise 3–5 sentence briefing covering: what type of piece, key specs (metal, stone, style), customer info, and any special notes or concerns requiring attention.

Order: ${order.poNumber}
Type: ${order.orderType || '—'}
Size: ${order.size || '—'}
Metal: ${order.metalType || '—'} ${order.metalColor || ''}
Diamond: ${order.diamondType || '—'}, Quality: ${order.diamondQuality || '—'}
Center Stone: ${order.centerStoneShape || '—'} ~${order.approximateCaratWeight || '?'}ct
Store/Customer: ${order.storeName || ''} — ${order.customerFullName || ''}
Quoted Cost: ${order.quotedCost ? '$' + Number(order.quotedCost).toLocaleString() : 'Not quoted'}
Customer Notes: ${order.customerNotes || 'None'}
Internal Notes: ${order.internalNotes || 'None'}
Head Style: ${order.headStyle || '—'}
Shank: ${order.shankStyle || '—'}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      messages: [{ role: 'user', content: prompt }],
    });

    const summary = (response.content[0] as any).text as string;
    await this.orderRepo.update(orderId, { aiSummary: summary });
    return { summary };
  }

  async clearSummary(orderId: string): Promise<void> {
    await this.orderRepo.update(orderId, { aiSummary: null });
  }
}
