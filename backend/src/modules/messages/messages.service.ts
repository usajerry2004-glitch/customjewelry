import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Order } from '../../database/entities/order.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';
import { SpacesService } from '../spaces/spaces.service';

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
}

// Roles whose accounts are scoped to one factory/stone-supplier and therefore
// shouldn't see internal staff chatter that isn't addressed to them.
const RESTRICTED_ROLES = [UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(OrderMessage) private msgRepo: Repository<OrderMessage>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    private notificationsService: NotificationsService,
    private spacesService: SpacesService,
  ) {}

  async getMessages(orderId: string, user: { id?: string; role: string }): Promise<any[]> {
    const messages = await this.msgRepo.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });

    const visible = messages.filter(m => {
      if (user.role === 'CUSTOMER') return !m.isInternal;
      if (RESTRICTED_ROLES.includes(user.role as UserRole)) {
        return !m.isInternal || m.authorId === user.id || (m.mentions || []).includes(user.id || '');
      }
      return true;
    });

    // Resolve mentioned user IDs to display names for rendering — mentions
    // itself stays as IDs so the visibility check above keeps working.
    // Filtered to well-formed UUIDs: older/legacy-imported orders can carry
    // junk values here, and `id` is a uuid column that throws on anything else.
    const allMentionedIds = Array.from(new Set(visible.flatMap(m => m.mentions || [])))
      .filter(id => UUID_RE.test(id));
    const mentionedUsers = allMentionedIds.length
      ? await this.userRepo.find({ where: { id: In(allMentionedIds) } })
      : [];
    const nameById = new Map(mentionedUsers.map(u => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email]));

    return visible.map(m => ({
      ...m,
      mentionNames: (m.mentions || []).map(id => nameById.get(id) || 'Unknown user'),
    }));
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
      ...attachment,
    });
    const saved = await this.msgRepo.save(msg);

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
    // messages something" half of that; the mention branch below still fires
    // independently even if the factory manager also @mentioned someone.
    if (user.role === UserRole.FACTORY_MANAGER) {
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
