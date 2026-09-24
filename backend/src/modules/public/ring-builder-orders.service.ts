import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { EmailService } from '../email/email.service';
import { SpacesService } from '../spaces/spaces.service';
import { OrdersService } from '../orders/orders.service';

export interface RingBuilderCustomerDto {
  firstName: string;
  lastName?: string;
  email: string;
  phoneNumber?: string;
  storeName?: string;
}

export interface RingBuilderShippingAddressDto {
  name?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface RingBuilderItemDto {
  // The Ring Builder checkout's own line-item/order number — required, used
  // as the idempotency key so a retried submission never double-creates.
  externalOrderId: string;
  designId?: string;
  modelId?: string;
  title?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  currency?: string;
  orderType?: string;
  size?: string;
  metalType?: string;
  metalColor?: string;
  // Combined shape+weight string, e.g. "0.20 ct Round" — parsed into
  // centerStoneShape/approximateCaratWeight (see parseStones below), and
  // kept verbatim in customerNotes regardless of whether parsing succeeds.
  stones?: string;
  setting?: string;
  coverage?: string;
  caratTotalWeight?: number;
  // Rendered preview image(s) of the exact configuration — e.g. multiple
  // camera angles from the configurator — fetched and saved as reference
  // CadFiles, same as a customer-uploaded reference image. imageUrl is kept
  // for backwards compatibility with the single-image integration already
  // live; when both are sent, imageUrl is treated as just another angle
  // (deduped against imageUrls, not sent twice).
  imageUrl?: string;
  imageUrls?: string[];
  referenceWeblink?: string;
}

export interface RingBuilderOrderDto {
  externalCartId?: string;
  // Their own label for the sales channel (e.g. "kira-website") — informational
  // only; every order from this endpoint is still tagged source: 'RING_BUILDER'
  // internally regardless of what they call it.
  source?: string;
  orderDate?: string;
  customer: RingBuilderCustomerDto;
  customerNotes?: string;
  refCustomerPo?: string;
  shippingAddress?: RingBuilderShippingAddressDto;
  items: RingBuilderItemDto[];
}

export interface RingBuilderOrderResult {
  success: boolean;
  externalCartId?: string;
  orders: {
    externalOrderId: string;
    poNumber: string;
    trackingToken: string;
    trackingUrl: string;
    status: OrderStatus;
  }[];
  message: string;
}

// Longest/most-specific first so "Elongated Cushion" matches before the
// plain "Cushion" suffix would.
const KNOWN_STONE_SHAPES = ['Elongated Cushion', 'Round', 'Oval', 'Emerald', 'Princess', 'Cushion', 'Radiant'];

@Injectable()
export class RingBuilderOrdersService {
  private readonly logger = new Logger(RingBuilderOrdersService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(Order)        private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(CadFile)      private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    private readonly emailService: EmailService,
    private readonly spacesService: SpacesService,
    private readonly ordersService: OrdersService,
    config: ConfigService,
  ) {
    this.frontendUrl = (config.get('FRONTEND_URL', 'http://localhost:3000') as string).split(',')[0].trim();
  }

  private trackingUrl(token: string): string {
    return `${this.frontendUrl}/track/${token}`;
  }

  // Best-effort split of a combined "0.20 ct Round" style string into shape +
  // weight. Falls back to keeping the whole string as the weight if the shape
  // isn't one we recognize — never drops data, since the raw string also
  // always ends up in customerNotes regardless of how this parses.
  private parseStones(stones?: string): { shape?: string; caratWeight?: string } {
    if (!stones) return {};
    const trimmed = stones.trim();
    for (const shape of KNOWN_STONE_SHAPES) {
      if (trimmed.toLowerCase().endsWith(shape.toLowerCase())) {
        const rest = trimmed.slice(0, trimmed.length - shape.length).trim();
        return { shape, caratWeight: rest || undefined };
      }
    }
    return { caratWeight: trimmed };
  }

  // Everything about this item/cart that doesn't have its own Order column
  // (setting, coverage, design/model IDs, shipping address, cart-level notes,
  // etc.) gets folded in here so nothing from the submission is silently lost.
  private buildCustomerNotes(dto: RingBuilderOrderDto, item: RingBuilderItemDto): string | undefined {
    const parts: string[] = [];
    if (item.title) parts.push(item.title);
    if (item.description) parts.push(item.description);

    const specLines = [
      item.setting ? `Setting: ${item.setting}` : null,
      item.coverage ? `Coverage: ${item.coverage}` : null,
      item.caratTotalWeight != null ? `Total Carat Weight: ${item.caratTotalWeight} ct` : null,
      item.designId ? `Design ID: ${item.designId}` : null,
      item.modelId ? `Model ID: ${item.modelId}` : null,
    ].filter((x): x is string => Boolean(x));
    if (specLines.length) parts.push(specLines.join('\n'));

    const addr = dto.shippingAddress;
    if (addr && Object.values(addr).some(Boolean)) {
      const addrLines = [
        'Shipping Address:',
        addr.name,
        addr.company,
        addr.address,
        [[addr.city, addr.state].filter(Boolean).join(', '), addr.zip].filter(Boolean).join(' ') || undefined,
        addr.country,
      ].filter((x): x is string => Boolean(x));
      parts.push(addrLines.join('\n'));
    }

    const metaLines = [
      dto.orderDate ? `Order Date: ${dto.orderDate}` : null,
      dto.source ? `Website Source: ${dto.source}` : null,
    ].filter((x): x is string => Boolean(x));
    if (metaLines.length) parts.push(metaLines.join('\n'));

    if (dto.customerNotes) parts.push(dto.customerNotes);

    return parts.length ? parts.join('\n\n') : undefined;
  }

  // ── Find or create customer by email (same pattern as the web-form intake) ──
  private async findOrCreateCustomer(dto: RingBuilderCustomerDto): Promise<User> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email })
      .getOne();
    if (existing) return existing;

    const passwordHash = await bcrypt.hash(`Kira@Ring${Date.now()}!`, 10);
    const user = this.userRepo.create({
      firstName: dto.firstName.trim(),
      lastName:  (dto.lastName || '—').trim(),
      email,
      passwordHash,
      role: UserRole.CUSTOMER,
      storeName: dto.storeName?.trim() || undefined,
      isActive: true,
    });
    return this.userRepo.save(user);
  }

  // Fetches the configurator's rendered preview image and saves it as a
  // reference CadFile — same as a customer-uploaded reference image, just
  // sourced from a URL instead of a multipart upload. Never blocks order
  // creation: a failed fetch just means no reference image, logged and
  // otherwise ignored.
  //
  // designerNotes must be exactly 'Reference image' or 'Customer reference
  // image' — the order detail page ([id].tsx) buckets a CadFile into the
  // Reference Files vs. Design Files section by matching that string
  // literally, there's no dedicated isReference column.
  // `label` (1-based position among this item's images) just distinguishes
  // filenames when there's more than one angle — it has no effect on how the
  // file is categorized or displayed.
  private async saveReferenceImage(order: Order, imageUrl: string, uploadedBy: string, label = 1): Promise<void> {
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
      const originalName = `ring-builder-render-${label}${ext}`;
      const uploaded = await this.spacesService.uploadWithThumbnail(buffer, 'customer-uploads', originalName, contentType);
      await this.cadRepo.save(this.cadRepo.create({
        orderId:       order.id,
        originalName,
        fileName:      uploaded.fileName,
        filePath:      uploaded.filePath,
        thumbnailPath: uploaded.thumbnailPath,
        uploadedBy,
        revisionNumber: 1,
        designerNotes: 'Customer reference image',
        status: CadFileStatus.UPLOADED,
      }));
    } catch (err) {
      this.logger.warn(`Failed to save Ring Builder reference image ${label} for ${order.poNumber}:`, err);
    }
  }

  // ── Main: create one Order per cart line item ────────────────────────
  async createFromRingBuilder(dto: RingBuilderOrderDto): Promise<RingBuilderOrderResult> {
    if (!dto.customer?.email || !dto.customer?.firstName) {
      throw new BadRequestException('customer.email and customer.firstName are required');
    }
    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('items must be a non-empty array');
    }
    const missingRef = dto.items.find(i => !i.externalOrderId);
    if (missingRef) {
      throw new BadRequestException('Every item requires an externalOrderId');
    }

    const customer = await this.findOrCreateCustomer(dto.customer);
    const results: RingBuilderOrderResult['orders'] = [];
    const newlyCreated: Order[] = [];

    for (const item of dto.items) {
      // Idempotent: a retried submission for an item we already have returns
      // the existing order instead of creating a duplicate.
      const existing = await this.orderRepo.findOne({ where: { externalOrderId: item.externalOrderId } });
      if (existing) {
        results.push({
          externalOrderId: item.externalOrderId,
          poNumber:        existing.poNumber,
          trackingToken:   existing.trackingToken,
          trackingUrl:     this.trackingUrl(existing.trackingToken),
          status:          existing.status,
        });
        continue;
      }

      const poNumber      = await this.ordersService.generatePoNumber();
      const trackingToken = randomBytes(32).toString('hex');
      const { shape: parsedShape, caratWeight: parsedCaratWeight } = this.parseStones(item.stones);

      const order = await this.orderRepo.save(this.orderRepo.create({
        poNumber,
        trackingToken,
        status: OrderStatus.NEW,
        source: 'RING_BUILDER',
        externalOrderId: item.externalOrderId,
        externalCartId:  dto.externalCartId,
        customerId:       customer.id,
        customerEmail:    customer.email,
        customerFullName: `${dto.customer.firstName} ${dto.customer.lastName || ''}`.trim(),
        storeName:        dto.customer.storeName?.trim() || customer.storeName,
        phoneNumber:      dto.customer.phoneNumber,
        refCustomerPo:    dto.refCustomerPo,
        orderType:        item.orderType || item.title || 'Ring Builder',
        size:             item.size,
        metalType:        item.metalType,
        metalColor:       item.metalColor,
        centerStoneShape: parsedShape,
        approximateCaratWeight: item.caratTotalWeight != null ? `${item.caratTotalWeight} ct TW` : parsedCaratWeight,
        quantity:         item.quantity || 1,
        quotedCost:       item.unitPrice != null ? item.unitPrice * (item.quantity || 1) : undefined,
        referenceWeblink: item.referenceWeblink,
        customerNotes:    this.buildCustomerNotes(dto, item),
        salesRepName:     'Ring Builder',
        salesRepId:       customer.salesRepId || undefined,
      }));
      newlyCreated.push(order);

      // imageUrl (legacy single-image field) plus imageUrls (multi-angle),
      // deduped so a client sending the same URL in both doesn't double it up.
      const imageUrls = Array.from(new Set([item.imageUrl, ...(item.imageUrls || [])].filter((u): u is string => Boolean(u))));
      await Promise.all(imageUrls.map((url, i) => this.saveReferenceImage(order, url, customer.email, i + 1)));

      results.push({
        externalOrderId: item.externalOrderId,
        poNumber:        order.poNumber,
        trackingToken:   order.trackingToken,
        trackingUrl:     this.trackingUrl(order.trackingToken),
        status:          order.status,
      });
    }

    if (newlyCreated.length) {
      await this.notifyAndEmail(customer, newlyCreated);
    }

    this.logger.log(`Ring Builder cart processed: ${newlyCreated.length} new order(s), ${results.length - newlyCreated.length} already existed`);
    return {
      success: true,
      externalCartId: dto.externalCartId,
      orders: results,
      message: `${results.length} order(s) received.`,
    };
  }

  private async notifyAndEmail(customer: User, orders: Order[]) {
    const staff = await this.userRepo.find({
      where: [{ role: UserRole.CAD_DESIGNER }, { role: UserRole.AUTHORIZER }],
    });
    const authEmails = staff.filter(u => u.role === UserRole.AUTHORIZER).map(u => u.email).filter(Boolean);

    for (const order of orders) {
      await Promise.all(staff.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.ORDER_CREATED,
          title: `New Ring Builder Order — ${order.poNumber}`,
          message: `${customer.storeName || customer.firstName + ' ' + customer.lastName} placed a Ring Builder order (${order.orderType}).`,
          orderId: order.id,
          targetUserId: u.id,
          isPriority: order.isPriorityCustomer,
        })),
      ));

      this.emailService.sendOrderPlaced({
        to:           customer.email,
        poNumber:     order.poNumber,
        customerName: order.customerFullName,
        orderType:    order.orderType || 'Ring Builder',
        orderId:      order.id,
        trackingToken: order.trackingToken,
      }).catch(err => this.logger.warn('Ring Builder order placed email failed:', err));

      if (authEmails.length) {
        this.emailService.sendNewOrderToAuthorizers({
          to:           authEmails,
          poNumber:     order.poNumber,
          customerName: order.customerFullName,
          orderType:    order.orderType || 'Ring Builder',
          storeName:    order.storeName || 'Ring Builder',
          orderId:      order.id,
          isPriorityCustomer: order.isPriorityCustomer,
        }).catch(err => this.logger.warn('Ring Builder new-order authorizer email failed:', err));
      }
    }
  }

  // ── Poll: same shape the completion webhook sends (OrdersService.notifyRingBuilderWebhook),
  // so the website has one schema for both push and pull, and can use this
  // as a reconciliation fallback for a webhook delivery it never got.
  // Falls back to a poNumber lookup: an order that didn't originate on their
  // site has no externalOrderId column value at all — its webhook deliveries
  // use poNumber in that field instead (see notifyRingBuilderWebhook), so a
  // poll for that same id has to resolve the same way.
  // Same "design supersedes reference" priority as
  // OrdersService.getOrderImageUrl — kept as its own copy here rather than a
  // shared import, matching how REFERENCE_NOTE_TAGS-style constants are
  // duplicated per-module elsewhere in this codebase.
  private async getOrderImageUrl(orderId: string): Promise<string | null> {
    const files = await this.cadRepo.find({ where: { orderId }, order: { createdAt: 'DESC' } });
    if (!files.length) return null;
    const isImage = (f: CadFile) => /\.(jpe?g|png)$/i.test(f.originalName || f.fileName || '');
    const isReference = (f: CadFile) => f.designerNotes === 'Reference image' || f.designerNotes === 'Customer reference image';

    const design = files.find(f => isImage(f) && !isReference(f));
    if (design) return design.thumbnailPath || design.filePath || null;
    const reference = files.find(f => isImage(f) && isReference(f));
    return reference ? (reference.thumbnailPath || reference.filePath || null) : null;
  }

  async getOrderByExternalId(externalOrderId: string) {
    const order = (await this.orderRepo.findOne({ where: { externalOrderId } }))
      || (await this.orderRepo.findOne({ where: { poNumber: externalOrderId } }));
    if (!order) throw new NotFoundException('Order not found');
    const imageUrl = await this.getOrderImageUrl(order.id);

    return {
      externalOrderId:   order.externalOrderId || order.poNumber,
      externalCartId:    order.externalCartId || order.poNumber,
      poNumber:          order.poNumber,
      status:            order.status,
      cadSubStatus:      order.cadSubStatus,
      stoneStatus:       order.stoneStatus,
      trackingNumber:    order.trackingNumber || null,
      courierName:       order.courierName || null,
      shipMethod:        order.shipMethod || null,
      committedShipDate: order.committedShipDate || null,
      shippedDate:       order.shippedDate || null,
      trackingUrl:       this.trackingUrl(order.trackingToken),
      updatedAt:         (order.status === OrderStatus.COMPLETED ? (order.completedAt ?? order.updatedAt) : order.updatedAt).toISOString(),
      imageUrl,
      // Full order details — see the matching fields in
      // OrdersService.notifyRingBuilderWebhook for why these are here.
      customerFullName:       order.customerFullName || null,
      customerEmail:          order.customerEmail || null,
      phoneNumber:            order.phoneNumber || null,
      storeName:              order.storeName || null,
      orderType:              order.orderType || null,
      metalType:              order.metalType || null,
      metalColor:             order.metalColor || null,
      size:                   order.size || null,
      centerStoneShape:       order.centerStoneShape || null,
      approximateCaratWeight: order.approximateCaratWeight || null,
      quantity:               order.quantity ?? null,
      quotedCost:             order.quotedCost ?? null,
      referenceWeblink:       order.referenceWeblink || null,
      customerNotes:          order.customerNotes || null,
      salesRepName:           order.salesRepName || null,
      createdAt:              order.createdAt ? order.createdAt.toISOString() : null,
      // Kept for any caller still reading the old narrow shape.
      completed:         order.status === OrderStatus.COMPLETED,
      completedAt:       order.completedAt,
    };
  }
}
