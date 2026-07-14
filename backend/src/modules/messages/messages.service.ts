import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Order } from '../../database/entities/order.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';

export class CreateMessageDto {
  @IsString()
  content: string;

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

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(OrderMessage) private msgRepo: Repository<OrderMessage>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    private notificationsService: NotificationsService,
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
    const allMentionedIds = Array.from(new Set(visible.flatMap(m => m.mentions || [])));
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
  // shows up as a mention option (and couldn't see the mention anyway).
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

  async postMessage(orderId: string, dto: CreateMessageDto, user: any): Promise<OrderMessage> {
    const isCustomer = user.role === 'CUSTOMER';
    const isInternal = isCustomer ? false : (dto.isInternal ?? false);
    const authorName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

    const msg = this.msgRepo.create({
      orderId,
      authorId: user.id,
      authorName,
      authorRole: user.role,
      content: dto.content,
      isInternal,
      mentions: dto.mentions || [],
    });
    const saved = await this.msgRepo.save(msg);

    if (isCustomer) {
      const authorizers = await this.userRepo.find({ where: { role: 'AUTHORIZER' as any } });
      await Promise.all(authorizers.map(auth =>
        this.notificationsService.create(
          NotificationType.CUSTOMER_MESSAGE,
          'Customer message — action required',
          `${authorName} left a message on an order and may need a response.`,
          orderId,
          auth.id,
        ),
      ));
    } else if (dto.mentions?.length) {
      const mentionedUsers = await this.userRepo.find({ where: { id: In(dto.mentions) } });
      await Promise.all(mentionedUsers.filter(u => u.id !== user.id).map(u =>
        this.notificationsService.create(
          NotificationType.MENTION,
          `You were mentioned on an order`,
          `${authorName} mentioned you: "${dto.content.substring(0, 100)}"`,
          orderId,
          u.id,
        ),
      ));
    }

    return saved;
  }
}
