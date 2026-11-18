import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { OrdersService } from '../orders/orders.service';
import { CUSTOMER_GUIDE, FAQ_KNOWLEDGE, STAFF_GUIDE } from './assistant.knowledge';

const MODEL = 'claude-haiku-5-5';
const MAX_HISTORY = 12;          // messages sent to the model per request
const MAX_MESSAGE_CHARS = 2000;  // per message
const MAX_TOOL_ROUNDS = 4;
const LOOKUP_LIMIT = 20;

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

// Same buckets as the Orders page CAD sub-tabs (see buildOrdersQuery's
// cadSubFilter), so the assistant's labels match what staff see.
function cadStage(o: any): string | null {
  if (o.status !== 'CAD_IN_PROGRESS') return null;
  if (o.cadSubStatus === 'REVISION') return 'Revision in progress';
  if (o.cadSubStatus === 'APPROVED') return 'Design approved by customer';
  if (o.cadSubStatus === 'REJECTED') return 'Design rejected';
  if (o.sentToCustomer) return 'Awaiting customer approval';
  if (o.cadSubStatus === 'UPLOADED') return 'Design uploaded, not yet sent to customer';
  return 'Pending CAD (designer working on it)';
}

// Tool enum → OrderFilterDto fields.
const STATUS_FILTER: Record<string, string> = {
  order_received: 'NEW', cad_design: 'CAD_IN_PROGRESS', in_production: 'VPO_ISSUED',
  manufactured: 'MANUFACTURED', shipped: 'SHIPPED', repair: 'REPAIR', completed: 'COMPLETED', cancelled: 'CANCELLED',
};
const CAD_FILTER: Record<string, string> = {
  pending_cad: 'cad_pending', uploaded_not_sent: 'cad_awaiting_quote', awaiting_customer_approval: 'cad_awaiting_approval',
  revision: 'cad_revision', approved: 'cad_approved',
};

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
    'Look up orders the current user is allowed to see (archived/closed projects excluded). Returns the total number of matches ' +
    'plus up to 20 orders (newest first) with status, CAD stage, specs and delivery dates. ' +
    'For questions like "which orders are pending CAD" or "what is in production", use the status / cad_stage filters ' +
    'instead of the query text. Combine filters with query to narrow by PO, customer or store.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'PO number, customer name or store name. Leave empty when listing by status.' },
      status: { type: 'string', enum: Object.keys(STATUS_FILTER), description: 'Only orders in this status.' },
      cad_stage: {
        type: 'string', enum: Object.keys(CAD_FILTER),
        description: 'Only CAD Design orders at this stage. pending_cad = designer has not uploaded yet; uploaded_not_sent = design uploaded but not sent to customer; awaiting_customer_approval = sent, waiting on customer; revision = customer asked for changes; approved = customer approved.',
      },
    },
  },
}];

function systemPrompt(user: ChatUser, isStaff: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `You are the Dashboard Assistant for Kira Jewels, a custom fine jewelry manufacturer. Today is ${today}.`,
    isStaff
      ? `You are talking to a Kira Jewels staff member (role: ${user.role}).`
      : 'You are talking to a customer (a jewelry retailer or their client) about their own orders.',
    'You help with: order status, CAD design stage, delivery and ship dates, jewelry care, sizing, metals, returns, and how to use the dashboard. Call the website "the dashboard", never "JewelFlow".',
    'Use the lookup_orders tool for any question about a specific order or orders; never guess order details. If no order matches, say so.',
    'Strict rules:',
    '- Never name, guess or hint at any factory, manufacturer, supplier, vendor or stone source, even if asked directly. Say production is handled by the Kira Jewels team.',
    '- Never state or estimate costs, prices, margins or quotes. For pricing, point to the order page or the sales rep.',
    '- Only discuss orders returned by the tool. Never invent dates; if a date is missing, say it is not set yet.',
    '- If a question is outside these topics or the reference text, or needs a decision (refunds, rush requests, changes), suggest messaging the team in the order conversation or contacting the sales rep.',
    'How to sound:',
    '- Write like a warm, helpful member of the Kira Jewels team chatting with someone they know. Use "you" and "we", contractions, and everyday words. It is fine to open with a short natural phrase ("Sure!", "Good question.", "Happy to help.") when it fits, but do not start every reply the same way.',
    '- Answer directly with the actual steps or facts. Never mention your "reference text", "information", "data" or "tools", and never say things like "I don\'t have the exact steps" when the steps are in the text below.',
    '- When you genuinely do not know, say so simply and point them to the right person, e.g. "That one\'s best answered by your sales rep. You can message them right from the order page."',
    '- Avoid stiff phrases like "please note", "kindly", "as per", "I apologize for any inconvenience" or "feel free to".',
    '- If someone asks whether you are a person, be honest that you are the dashboard\'s automated assistant.',
    '- Keep it short: a few sentences, or a short list of steps. Write plain text only: no markdown (no asterisks, bold, headings or tables). For steps or lists, start each line with "- ".',
    'When listing orders, always state the total that matched. Use the stage names as given (e.g. "Pending CAD", "Awaiting customer approval").',
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
    const cadSubFilter = CAD_FILTER[input?.cad_stage];
    const status = cadSubFilter ? 'CAD_IN_PROGRESS' : STATUS_FILTER[input?.status];
    // OrdersService applies the same role scoping as the Orders page:
    // customers only ever get their own orders back.
    const { orders, total } = await this.ordersService.findAll(
      { search: query || undefined, status, cadSubFilter, limit: LOOKUP_LIMIT } as any, user as any,
    );
    return JSON.stringify({
      totalMatching: total,
      shown: orders.length,
      ...(total > orders.length ? { note: `Only the newest ${orders.length} of ${total} are listed. Tell the user the total and that the full list is on the Orders page.` } : {}),
      orders: orders.map(o => safeOrder(o, isStaff)),
    });
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
            .map(b => b.text).join('\n')
            // The chat window shows plain text; drop markdown bold/heading marks if the model slips.
            .replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').trim();
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
