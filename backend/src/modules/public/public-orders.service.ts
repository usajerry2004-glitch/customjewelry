import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { join } from 'path';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';

export interface WebOrderDto {
  // Contact
  firstName: string;
  lastName: string;
  storeName?: string;
  email: string;
  phoneNumber?: string;

  // Order specs
  orderType?: string;
  size?: string;
  metalType?: string;
  metalColor?: string;
  diamondQuality?: string;
  diamondType?: string;
  centerStoneShape?: string;
  approximateCaratWeight?: string;

  // Reference
  referenceWeblink?: string;
  refCustomerPo?: string;
  stockNumber?: string;
  customerNotes?: string;
}

export interface WebOrderResult {
  success: boolean;
  orderRef: string;
  message: string;
}

@Injectable()
export class PublicOrdersService {
  private readonly logger = new Logger(PublicOrdersService.name);

  constructor(
    @InjectRepository(Order)        private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(CadFile)      private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
  ) {}

  // ── Auto-generate next PO number ─────────────────────────────────────
  private async nextPo(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `KJ-${year}-`;
    const latest = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.poNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('o.poNumber', 'DESC')
      .getOne();
    let seq = 1;
    if (latest) {
      const parts = latest.poNumber.split('-');
      const last = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(last)) seq = last + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  // ── Find or create customer by email ─────────────────────────────────
  private async findOrCreateCustomer(dto: WebOrderDto): Promise<User> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) return existing;

    const passwordHash = await bcrypt.hash(`Kira@Web${Date.now()}!`, 10);
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

  // ── Main: create order from web form ─────────────────────────────────
  async createFromWebForm(
    dto: WebOrderDto,
    files: Express.Multer.File[],
  ): Promise<WebOrderResult> {
    try {
      const customer = await this.findOrCreateCustomer(dto);
      const poNumber = await this.nextPo();

      const order = await this.orderRepo.save(this.orderRepo.create({
        poNumber,
        status: OrderStatus.CAD_IN_PROGRESS,
        customerId:       customer.id,
        customerEmail:    customer.email,
        customerFullName: `${dto.firstName} ${dto.lastName}`.trim(),
        storeName:        dto.storeName?.trim() || customer.storeName,
        phoneNumber:      dto.phoneNumber,
        orderType:        dto.orderType,
        size:             dto.size,
        metalType:        dto.metalType,
        metalColor:       dto.metalColor,
        diamondQuality:   dto.diamondQuality,
        diamondType:      dto.diamondType,
        centerStoneShape: dto.centerStoneShape,
        approximateCaratWeight: dto.approximateCaratWeight,
        referenceWeblink: dto.referenceWeblink,
        refCustomerPo:    dto.refCustomerPo,
        stockNumber:      dto.stockNumber,
        customerNotes:    dto.customerNotes,
        salesRepName:     'Web Order',
      }));

      // Save uploaded reference images
      for (const file of files || []) {
        await this.cadRepo.save(this.cadRepo.create({
          orderId:      order.id,
          originalName: file.originalname,
          fileName:     file.filename,
          filePath:     join(process.cwd(), 'uploads', 'cad', file.filename),
          uploadedBy:   dto.email,
          revisionNumber: 1,
          designerNotes: 'Customer reference image',
          status: CadFileStatus.UPLOADED,
        }));
      }

      // Notify CAD team + Authorizers
      const staff = await this.userRepo.find({
        where: [{ role: UserRole.CAD_DESIGNER }, { role: UserRole.AUTHORIZER }, { role: UserRole.ADMIN }],
      });
      await Promise.all(staff.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.ORDER_CREATED,
          title: `New Web Order — ${order.poNumber}`,
          message: `A new order from ${dto.storeName || dto.firstName + ' ' + dto.lastName} was submitted via the website.`,
          orderId: order.id,
          targetUserId: u.id,
        })),
      ));

      this.logger.log(`Web order created: ${order.poNumber} for ${customer.email}`);
      return {
        success: true,
        orderRef: order.poNumber,
        message:  `Your order ${order.poNumber} has been received. Our team will be in touch shortly.`,
      };
    } catch (err) {
      this.logger.error('Web order creation failed', err);
      return { success: false, orderRef: '', message: 'Failed to submit order. Please try again.' };
    }
  }
}
