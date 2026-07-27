import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { OrderConversationRead } from '../../database/entities/order-conversation-read.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Order } from '../../database/entities/order.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';
import { SpacesService } from '../spaces/spaces.service';
import { OrdersService } from '../orders/orders.service';
import { MessagesGateway } from './messages.gateway';
import { isMessageVisible } from './message-visibility';

export class CreateMessageDto {
  // Optional now — a message can consist of just an attachment.
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;

  // User IDs of the specific people mentioned — not roles.
  @IsOptional()
  @IsArray()
  mentions?: string[];

  // The message being replied to, if this is a threaded reply.
  @IsOptional()
  @IsString()
  parentMessageId?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(OrderMessage) private msgRepo: Repository<OrderMessage>,
    @InjectRepository(OrderConversationRead) private readRepo: Repository<OrderConversationRead>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    private notificationsService: NotificationsService,
    private spacesService: SpacesService,
    private ordersService: OrdersService,
    private gateway: MessagesGateway,
  ) {}

  // Shared by getMessages (batch, for the whole thread) and postMessage
  // (single new message) — resolves mention IDs to display names and, for
  // threaded replies, a short preview of the parent message.
  private async enrichMessages(messages: OrderMessage[]): Promise<any[]> {
    const allMentionedIds = Array.from(new Set(messages.flatMap(m => m.mentions || [])))
      .filter(id => UUID_RE.test(id));
    const mentionedUsers = allMentionedIds.length
      ? await this.userRepo.find({ where: { id: In(allMentionedIds) } })
      : [];
    const nameById = new Map(mentionedUsers.map(u => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email]));

    const parentIds = Array.from(new Set(messages.map(m => m.parentMessageId).filter((id): id is string => !!id)));
    const parents = parentIds.length ? await this.msgRepo.find({ where: { id: In(parentIds) } }) : [];
    const parentById = new Map(parents.map(p => [p.id, p]));

    return messages.map(m => {
      const parent = m.parentMessageId ? parentById.get(m.parentMessageId) : null;
      return {
        ...m,
        mentionNames: (m.mentions || []).map(id => nameById.get(id) || 'Unknown user'),
        parentPreview: parent
          ? { id: parent.id, authorName: parent.authorName, content: parent.content ? parent.content.slice(0, 120) : (parent.attachmentName ? `📎 ${parent.attachmentName}` : '') }
          : null,
      };
    });
  }

  async getMessages(orderId: string, user: { id?: string; role: string }): Promise<any[]> {
    const messages = await this.msgRepo.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });

    const visible = messages.filter(m => isMessageVisible(user.role, user.id, m));

    // Filtered to well-formed UUIDs in enrichMessages: older/legacy-imported
    // orders can carry junk values in `mentions`, and `id` is a uuid column
    // that throws on anything else.
    return this.enrichMessages(visible);
  }

  async markRead(orderId: string, user: { id: string; firstName?: string; lastName?: string; email: string }): Promise<void> {
    await this.readRepo.upsert({ userId: user.id, orderId }, ['userId', 'orderId']);
    const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    this.gateway.broadcastRead(orderId, user.id, userName, new Date());
  }

  // "Seen by" state for a whole order's thread — who has viewed the
  // conversation and when, so the frontend can show "Seen by X" on whichever
  // message was the most recent at the time each reader last opened it.
  async getReads(orderId: string): Promise<{ userId: string; name: string; lastReadAt: Date }[]> {
    const reads = await this.readRepo.find({ where: { orderId } });
    if (!reads.length) return [];
    const users = await this.userRepo.find({ where: { id: In(reads.map(r => r.userId)) } });
    const nameById = new Map(users.map(u => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email]));
    return reads.map(r => ({ userId: r.userId, name: nameById.get(r.userId) || 'Unknown user', lastReadAt: r.lastReadAt }));
  }

  // Keyword search across message content — ILIKE substring match, same
  // approach as the order search filter, not Postgres tsvector ranking.
  // Scoped to the same per-role order visibility as the rest of the app
  // (via OrdersService.getVisibleOrderIds) and to the same per-message
  // internal/mention visibility getMessages() already enforces.
  async searchMessages(query: string, user: { id?: string; role: string; email: string; companyId?: string | null; assignedFactory?: any; assignedSupplySource?: any }): Promise<any[]> {
    const term = (query || '').trim();
    if (term.length < 2 || user.role === 'CUSTOMER') return [];

    const visibleOrderIds = await this.ordersService.getVisibleOrderIds(user as any);
    if (visibleOrderIds && visibleOrderIds.length === 0) return [];

    const escaped = term.replace(/[%_\\]/g, c => `\\${c}`);
    const qb = this.msgRepo.createQueryBuilder('m').where('m.content ILIKE :s', { s: `%${escaped}%` });
    if (visibleOrderIds) qb.andWhere('m.orderId IN (:...ids)', { ids: visibleOrderIds });
    qb.orderBy('m.createdAt', 'DESC').take(8);

    const matches = await qb.getMany();
    const visible = matches.filter(m => isMessageVisible(user.role, user.id, m));

    const orderIds = Array.from(new Set(visible.map(m => m.orderId)));
    const orders = orderIds.length
      ? await this.orderRepo.find({ where: { id: In(orderIds) }, select: ['id', 'poNumber', 'storeName', 'customerFullName'] })
      : [];
    const orderById = new Map(orders.map(o => [o.id, o]));

    return visible.map(m => {
      const order = orderById.get(m.orderId);
      return {
        id: m.id, orderId: m.orderId, content: m.content, authorName: m.authorName, createdAt: m.createdAt,
        poNumber: order?.poNumber ?? null, storeName: order?.storeName || order?.customerFullName || null,
      };
    });
  }

  // Who a message on this order can be @mentioned to — scoped the same way the
  // order itself is scoped, so a Factory Manager for a different factory never
  // shows up as a mention option (and couldn't see the mention anyway), and a
  // Sales Rep only shows up if they're actually the rep assigned to this order.
  async getMentionableUsers(orderId: string): Promise<User[]> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) return [];

    const roleUsers = await this.userRepo.find({
      where: { role: In([UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER]), isActive: true },
    });

    const extra: User[] = [];
    if (order.salesRepId) {
      const rep = await this.userRepo.findOne({ where: { id: order.salesRepId } });
      if (rep) extra.push(rep);
    }
    if (order.assignedFactory) {
      extra.push(...await this.userRepo.find({ where: { assignedFactory: order.assignedFactory, isActive: true } }));
    }
    if (order.supplySource) {
      extra.push(...await this.userRepo.find({ where: { assignedSupplySource: order.supplySource, isActive: true } }));
    }

    const byId = new Map([...roleUsers, ...extra].map(u => [u.id, u]));
    return Array.from(byId.values());
  }

  async postMessage(orderId: string, dto: CreateMessageDto, user: any, file?: Express.Multer.File): Promise<OrderMessage> {
    if (!dto.content?.trim() && !file) {
      throw new BadRequestException('Message must have content or an attachment.');
    }

    const isCustomer = user.role === 'CUSTOMER';
    const isInternal = isCustomer ? false : (dto.isInternal ?? false);
    const authorName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

    let attachment: { attachmentUrl: string; attachmentName: string; attachmentSize: number; attachmentMimeType: string } | null = null;
    if (file) {
      const uploaded = await this.spacesService.uploadWithThumbnail(file.buffer, 'chat', file.originalname, file.mimetype);
      attachment = {
        attachmentUrl: uploaded.filePath,
        attachmentName: file.originalname,
        attachmentSize: file.size,
        attachmentMimeType: file.mimetype,
      };
    }

    const msg = this.msgRepo.create({
      orderId,
      authorId: user.id,
      authorName,
      authorRole: user.role,
      content: dto.content?.trim() || '',
      isInternal,
      mentions: dto.mentions || [],
      parentMessageId: dto.parentMessageId || null,
      ...attachment,
    });
    const saved = await this.msgRepo.save(msg);

    const [enriched] = await this.enrichMessages([saved]);
    this.gateway.broadcastNewMessage(orderId, enriched);

    if (isCustomer) {
      const [authorizers, admins, order] = await Promise.all([
        this.userRepo.find({ where: { role: 'AUTHORIZER' as any } }),
        this.userRepo.find({ where: { role: UserRole.ADMIN } }),
        this.orderRepo.findOne({ where: { id: orderId } }),
      ]);
      await Promise.all([...authorizers, ...admins].map(u =>
        this.notificationsService.create(
          NotificationType.CUSTOMER_MESSAGE,
          'Customer message — action required',
          `${authorName} left a message on an order and may need a response.`,
          orderId,
          u.id,
          order?.isPriorityCustomer,
        ),
      ));
    }

    // Admin bell notifications are scoped to just mentions + customer/factory
    // messages (not every internal status update) — this is the "factory
    // messages something" half of that. Skipped when the message already
    // @mentions someone: that's a targeted message, not a broadcast, so only
    // the mentioned user(s) should be notified (via the mention branch below).
    if (user.role === UserRole.FACTORY_MANAGER && !dto.mentions?.length) {
      const [admins, order] = await Promise.all([
        this.userRepo.find({ where: { role: UserRole.ADMIN } }),
        this.orderRepo.findOne({ where: { id: orderId } }),
      ]);
      await Promise.all(admins.map(admin =>
        this.notificationsService.create(
          NotificationType.FACTORY_MESSAGE,
          'Factory message — action required',
          `${authorName} left a message on an order and may need a response.`,
          orderId,
          admin.id,
          order?.isPriorityCustomer,
        ),
      ));
    }

    if (dto.mentions?.length) {
      const preview = saved.content ? `"${saved.content.substring(0, 100)}"` : `an attachment (${attachment?.attachmentName})`;
      const [mentionedUsers, order] = await Promise.all([
        this.userRepo.find({ where: { id: In(dto.mentions) } }),
        this.orderRepo.findOne({ where: { id: orderId } }),
      ]);
      await Promise.all(mentionedUsers.filter(u => u.id !== user.id).map(u =>
        this.notificationsService.create(
          NotificationType.MENTION,
          `You were mentioned on an order`,
          `${authorName} mentioned you: ${preview}`,
          orderId,
          u.id,
          order?.isPriorityCustomer,
        ),
      ));
    }

    return saved;
  }
}
