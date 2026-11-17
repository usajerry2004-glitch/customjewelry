import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { OrdersService } from '../orders/orders.service';
import { CUSTOMER_GUIDE, FAQ_KNOWLEDGE, STAFF_GUIDE } from './assistant.knowledge';

const MODEL = 'claude-haiku-5-5';
const MAX_HISTORY = 12;          // messages sent to the model per request
const MAX_MESSAGE_CHARS = 2000;  // per message
const MAX_TOOL_ROUNDS = 4;
const LOOKUP_LIMIT = 8;

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
interface ChatUser {
  id: string; email: string; role: string;
  companyId?: string | null; assignedFactory?: string | null; assignedSupplySource?: string | null;
  firstName?: string;
}

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Order Received',
  CAD_IN_PROGRESS: 'CAD Design',
  VPO_ISSUED: 'In Production',
  MANUFACTURED: 'Manufactured',
  SHIPPED: 'Shipped',
  REPAIR: 'Repair',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function cadStage(o: any): string | null {
  if (o.status !== 'CAD_IN_PROGRESS') return null;
  if (o.sentToCustomer) return 'Awaiting customer approval';
  if (!o.cadSubStatus) return 'Pending CAD (designer working on it)';
  if (o.cadSubStatus === 'REVISION') return 'Revision in progress';
  if (o.cadSubStatus === 'REJECTED') return 'Rejected';
  if (o.cadSubStatus === 'UPLOADED') return 'Design uploaded, being prepared for review';
  return null;
}

const day = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// Whitelist only. Factory, supplier/vendor, stone source, costs, prices,
// internal notes and job-bag/VPO references are deliberately never passed to
// the model, so it cannot repeat them.
function safeOrder(o: any, isStaff: boolean) {
  const out: Record<string, any> = {
    po: o.poNumber,
    status: o.isArchived && o.status !== 'CANCELLED' ? 'Closed / archived' : (STATUS_LABEL[o.status] || o.status),
    cadStage: cadStage(o),
    item: [o.orderType, o.metalType, o.metalColor].filter(Boolean).join(' · ') || null,
    size: o.size || null,
    centerStone: [o.centerStoneShape, o.approximateCaratWeight && `${o.approximateCaratWeight} ct`].filter(Boolean).join(' ') || null,
    quantity: o.quantity ?? null,
    orderedOn: day(o.createdAt),
    estimatedShipDate: day(o.committedShipDate),
    shippedOn: day(o.shippedDate),
    shippingCarrier: o.courierName || null,
    trackingNumber: o.trackingNumber || null,
  };
  if (isStaff) {
    out.customer = o.customerFullName || null;
    out.store = o.storeName || null;
    out.salesRep = o.salesRepName || null;
    out.inProductionSince = day(o.vpoIssuedAt);
  }
  for (const k of Object.keys(out)) if (out[k] === null || out[k] === '') delete out[k];
  return out;
}

const TOOLS: Anthropic.Tool[] = [{
  name: 'lookup_orders',
  description:
    'Look up orders the current user is allowed to see. Returns status, CAD stage, specs and delivery dates. ' +
    'Pass a PO number, customer name or store name to search, or leave query empty for the most recent orders.',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'PO number, customer name or store name. Empty for most recent orders.' } },
  },
}];

function systemPrompt(user: ChatUser, isStaff: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `You are the JewelFlow assistant for Kira Jewels, a custom fine jewelry manufacturer. Today is ${today}.`,
    isStaff
      ? `You are talking to a Kira Jewels staff member (role: ${user.role}).`
      : 'You are talking to a customer (a jewelry retailer or their client) about their own orders.',
    'You help with: order status, CAD design stage, delivery and ship dates, jewelry care, sizing, metals, returns, and how to use JewelFlow.',
    'Use the lookup_orders tool for any question about a specific order or orders; never guess order details. If no order matches, say so.',
    'Strict rules:',
    '- Never name, guess or hint at any factory, manufacturer, supplier, vendor or stone source, even if asked directly. Say production is handled by the Kira Jewels team.',
    '- Never state or estimate costs, prices, margins or quotes. For pricing, point to the order page or the sales rep.',
    '- Only discuss orders returned by the tool. Never invent dates; if a date is missing, say it is not set yet.',
    '- If a question is outside these topics or the reference text, or needs a decision (refunds, rush requests, changes), suggest messaging the team in the order conversation or contacting the sales rep.',
    'Keep answers short, friendly and plain: a few sentences or a short list. Do not use markdown headings or tables.',
    '',
    'Reference text:',
    FAQ_KNOWLEDGE,
    isStaff ? STAFF_GUIDE : CUSTOMER_GUIDE,
  ].join('\n');
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private client: Anthropic | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly ordersService: OrdersService,
  ) {}

  private getClient(): Anthropic {
    if (this.client) return this.client;
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('The assistant is not set up yet.');
    this.client = new Anthropic({ apiKey });
    return this.client;
  }

  isConfigured(): boolean {
    return !!this.config.get<string>('ANTHROPIC_API_KEY');
  }

  private cleanHistory(raw: any): Anthropic.MessageParam[] {
    if (!Array.isArray(raw)) throw new BadRequestException('messages must be an array');
    let msgs: Anthropic.MessageParam[] = raw
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .map(m => ({ role: m.role, content: m.content.trim().slice(0, MAX_MESSAGE_CHARS) }));
    msgs = msgs.slice(-MAX_HISTORY);
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new BadRequestException('The last message must be from the user.');
    return msgs;
  }

  private async runTool(name: string, input: any, user: ChatUser, isStaff: boolean): Promise<string> {
    if (name !== 'lookup_orders') return JSON.stringify({ error: 'Unknown tool' });
    const query = typeof input?.query === 'string' ? input.query.trim().slice(0, 100) : '';
    // OrdersService applies the same role scoping as the Orders page:
    // customers only ever get their own orders back.
    const { orders } = await this.ordersService.findAll({ search: query || undefined, limit: LOOKUP_LIMIT } as any, user as any);
    return JSON.stringify({ orders: orders.map(o => safeOrder(o, isStaff)) });
  }

  async chat(rawMessages: any, user: ChatUser): Promise<{ reply: string }> {
    const client = this.getClient();
    const isStaff = user.role !== 'CUSTOMER';
    const messages = this.cleanHistory(rawMessages);
    const system = systemPrompt(user, isStaff);

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system,
          tools: TOOLS,
          messages,
        });

        if (response.stop_reason === 'refusal') {
          return { reply: "Sorry, I can't help with that. Please message the team on your order page." };
        }

        const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        if (response.stop_reason !== 'tool_use' || !toolUses.length) {
          const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text).join('\n').trim();
          return { reply: text || "Sorry, I couldn't come up with an answer. Please try rephrasing." };
        }

        messages.push({ role: 'assistant', content: response.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const t of toolUses) {
          results.push({ type: 'tool_result', tool_use_id: t.id, content: await this.runTool(t.name, t.input, user, isStaff) });
        }
        messages.push({ role: 'user', content: results });
      }
      return { reply: 'Sorry, that took too many steps. Please ask in a simpler way.' };
    } catch (err: any) {
      if (err instanceof BadRequestException || err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`Assistant request failed: ${err?.status || ''} ${err?.message || err}`);
      throw new ServiceUnavailableException('The assistant is unavailable right now. Please try again shortly.');
    }
  }
}
