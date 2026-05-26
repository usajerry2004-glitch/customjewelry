import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { User } from '../../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';

export class CreateMessageDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;

  @IsOptional()
  @IsArray()
  mentions?: string[];
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(OrderMessage) private msgRepo: Repository<OrderMessage>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private notificationsService: NotificationsService,
  ) {}

  async getMessages(orderId: string, userRole: string): Promise<OrderMessage[]> {
    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.orderId = :orderId', { orderId })
      .orderBy('m.createdAt', 'ASC');
    if (userRole === 'CUSTOMER') {
      qb.andWhere('m.isInternal = false');
    }
    return qb.getMany();
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
      for (const auth of authorizers) {
        await this.notificationsService.create(
          NotificationType.CUSTOMER_MESSAGE,
          'Customer message — action required',
          `${authorName} left a message on an order and may need a response.`,
          orderId,
          auth.id,
        );
      }
    } else if (dto.mentions?.length) {
      for (const mention of dto.mentions) {
        const role = mention.replace('@', '');
        const users = await this.userRepo.find({ where: { role: role as any } });
        for (const u of users) {
          if (u.id !== user.id) {
            await this.notificationsService.create(
              NotificationType.MENTION,
              `You were mentioned on an order`,
              `${authorName} mentioned ${mention}: "${dto.content.substring(0, 100)}"`,
              orderId,
              u.id,
            );
          }
        }
      }
    }

    return saved;
  }
}
