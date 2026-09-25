import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const LOOKUP_TIMEOUT_MS = 15_000;

export interface RightClickLineItem {
  itemcode?: string;
  description?: string;
  quantity?: string | number;
  price?: string | number;
  amount?: string | number;
  discountpercent?: string | number;
  discount?: string | number;
  [key: string]: any;
}

export interface RightClickCustomerOrder {
  id?: string | number;
  order_no?: string;
  po?: string;
  date?: string;
  customer?: {
    name?: string;
    company?: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    email?: string;
    phone?: string;
    [key: string]: any;
  };
  shipto?: Record<string, any>;
  lineitems?: RightClickLineItem[];
  [key: string]: any;
}

interface RightClickApiResponse {
  Success?: boolean;
  Message?: string;
  SessionId?: string;
  customerorders?: RightClickCustomerOrder[];
}

// Read-only lookups only — this service never calls RightClick's write APIs
// (Create Invoice / Create Order), which post real transactions to their
// General Ledger. JewelFlow generates its own invoice PDF from what's fetched
// here instead.
//
// SessionIds are IP-locked and, per RightClick's own API reference, last
// "several hours" — cached conservatively for 3 to stay well inside that
// window rather than re-authenticating on every lookup (their rate limit is
// 30 calls/min per IP).
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class RightClickService {
  private readonly logger = new Logger(RightClickService.name);
  private sessionId: string | null = null;
  private sessionObtainedAt = 0;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!(this.baseUrl() && this.serial() && this.apiKey() && this.apiPassword());
  }

  private baseUrl(): string {
    return (this.config.get<string>('RIGHTCLICK_BASE_URL') || '').trim().replace(/\/+$/, '');
  }
  private serial(): string { return this.config.get<string>('RIGHTCLICK_SERIAL') || ''; }
  private apiKey(): string { return this.config.get<string>('RIGHTCLICK_API_KEY') || ''; }
  private apiPassword(): string { return this.config.get<string>('RIGHTCLICK_API_PASSWORD') || ''; }

  // Without an explicit Accept/Content-Type of application/json, RightClick's
  // server falls back to serving its normal HTML login page (still with a 200/302
  // and no error) instead of routing the request to its API handler — confirmed
  // by testing directly against their test environment. Both headers are sent
  // per their own docs' Testing section ("All API calls need Content-Type set to
  // application/json").
  private async fetchJson(url: string): Promise<{ ok: boolean; status: number; body: RightClickApiResponse | null }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      const body = (await res.json().catch(() => null)) as RightClickApiResponse | null;
      return { ok: res.ok, status: res.status, body };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async authenticate(): Promise<string> {
    const url = `${this.baseUrl()}/?serial=${encodeURIComponent(this.serial())}&apikey=${encodeURIComponent(this.apiKey())}&apipassword=${encodeURIComponent(this.apiPassword())}`;
    const { ok, status, body } = await this.fetchJson(url);
    if (!ok || !body?.Success || !body.SessionId) {
      throw new Error(body?.Message || `RightClick authentication failed (HTTP ${status}).`);
    }
    this.sessionId = body.SessionId;
    this.sessionObtainedAt = Date.now();
    return this.sessionId;
  }

  private async getSessionId(forceFresh = false): Promise<string> {
    if (!forceFresh && this.sessionId && Date.now() - this.sessionObtainedAt < SESSION_TTL_MS) {
      return this.sessionId;
    }
    return this.authenticate();
  }

  // Looks up an order by RightClick order number. Returns null when
  // RightClick has no matching order — not an error, since the admin may
  // simply have mistyped the number.
  async lookupOrder(orderNumber: string): Promise<RightClickCustomerOrder | null> {
    if (!this.isConfigured()) {
      throw new BadRequestException('RightClick integration is not configured yet — ask an admin to set the RIGHTCLICK_BASE_URL/SERIAL/API_KEY/API_PASSWORD environment variables.');
    }

    const lookupUrl = (sessionId: string) =>
      `${this.baseUrl()}/?sessionid=${encodeURIComponent(sessionId)}&api=Customer-Order&ordernumber=${encodeURIComponent(orderNumber)}`;

    let sessionId = await this.getSessionId();
    let { ok, status, body } = await this.fetchJson(lookupUrl(sessionId));

    // A stale/expired session reads as an auth-flavored failure — re-authenticate
    // once and retry before giving up, rather than surfacing a confusing error
    // for what's really just cache staleness.
    if ((!ok || body?.Success === false) && (status === 401 || /session/i.test(body?.Message || ''))) {
      this.logger.log('RightClick session looked stale on order lookup — re-authenticating and retrying once.');
      sessionId = await this.getSessionId(true);
      ({ ok, status, body } = await this.fetchJson(lookupUrl(sessionId)));
    }

    if (!ok || body?.Success === false) {
      throw new BadRequestException(body?.Message || `RightClick order lookup failed (HTTP ${status}).`);
    }

    const orders = body?.customerorders || [];
    return orders[0] || null;
  }
}
