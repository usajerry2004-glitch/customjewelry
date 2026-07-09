import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { EmailService } from '../email/email.service';
import { SpacesService } from '../spaces/spaces.service';
import { OrdersService } from '../orders/orders.service';

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
    private readonly emailService: EmailService,
    private readonly spacesService: SpacesService,
    private readonly ordersService: OrdersService,
  ) {}

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
      const customer  = await this.findOrCreateCustomer(dto);
      const poNumber  = await this.ordersService.generatePoNumber();
      const trackingToken = randomBytes(32).toString('hex');

      const order = await this.orderRepo.save(this.orderRepo.create({
        poNumber,
        trackingToken,
        status: OrderStatus.NEW,
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

      // Save uploaded reference images — upload + thumbnail + DB insert run
      // concurrently per file instead of one file at a time.
      await Promise.all((files || []).map(async file => {
        const uploaded = await this.spacesService.uploadWithThumbnail(file.buffer, 'customer-uploads', file.originalname, file.mimetype);
        await this.cadRepo.save(this.cadRepo.create({
          orderId:      order.id,
          originalName: file.originalname,
          fileName:      uploaded.fileName,
          filePath:      uploaded.filePath,
          thumbnailPath: uploaded.thumbnailPath,
          uploadedBy:   dto.email,
          revisionNumber: 1,
          designerNotes: 'Customer reference image',
          status: CadFileStatus.UPLOADED,
        }));
      }));

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

      // Email customer with tracking link
      this.emailService.sendOrderPlaced({
        to:             customer.email,
        poNumber:       order.poNumber,
        customerName:   order.customerFullName,
        orderType:      order.orderType || 'Custom Order',
        orderId:        order.id,
        trackingToken,
      }).catch(err => this.logger.warn('Order placed email failed:', err));

      // Email authorizers + admins about the new order
      const authEmails = staff
        .filter(u => u.role === UserRole.AUTHORIZER)
        .map(u => u.email)
        .filter(Boolean);
      if (authEmails.length) {
        this.emailService.sendNewOrderToAuthorizers({
          to:           authEmails,
          poNumber:     order.poNumber,
          customerName: order.customerFullName,
          orderType:    order.orderType || 'Custom Order',
          storeName:    order.storeName || 'Web Order',
          orderId:      order.id,
        }).catch(err => this.logger.warn('New order authorizer email failed:', err));
      }

      this.logger.log(`Web order created: ${order.poNumber} for ${customer.email}`);
      return {
        success:  true,
        orderRef: order.poNumber,
        message:  `Your order ${order.poNumber} has been received. Our team will be in touch shortly.`,
      };
    } catch (err) {
      this.logger.error('Web order creation failed', err);
      return { success: false, orderRef: '', message: 'Failed to submit order. Please try again.' };
    }
  }

  // ── Get order by tracking token ───────────────────────────────────────
  async getOrderByToken(token: string) {
    const order = await this.orderRepo.findOne({ where: { trackingToken: token } });
    if (!order) throw new NotFoundException('Order not found');

    const cadFiles = await this.cadRepo.find({
      where: { orderId: order.id },
      order: { createdAt: 'ASC' },
    });

    return {
      poNumber:       order.poNumber,
      status:         order.status,
      customerName:   order.customerFullName,
      orderType:      order.orderType,
      metalType:      order.metalType,
      metalColor:     order.metalColor,
      size:           order.size,
      diamondQuality: order.diamondQuality,
      centerStoneShape: order.centerStoneShape,
      approximateCaratWeight: order.approximateCaratWeight,
      customerNotes:  order.customerNotes,
      refCustomerPo:  order.refCustomerPo ?? null,
      createdAt:      order.createdAt,
      updatedAt:      order.updatedAt,
      trackingNumber: order.trackingNumber,
      shipMethod:     order.shipMethod,
      quotedCost:     order.quotedCost ?? null,
      cadFiles: cadFiles.map(f => ({
        id:             f.id,
        status:         f.status,
        originalName:   f.originalName,
        fileName:       f.fileName,
        designerNotes:  f.designerNotes,
        customerFeedback: f.customerFeedback,
        revisionNumber: f.revisionNumber,
        createdAt:      f.createdAt,
      })),
    };
  }

  // ── Customer approves a CAD file ──────────────────────────────────────
  async approveCad(token: string, cadId: string) {
    const order = await this.orderRepo.findOne({ where: { trackingToken: token } });
    if (!order) throw new NotFoundException('Order not found');

    const cad = await this.cadRepo.findOne({ where: { id: cadId, orderId: order.id } });
    if (!cad) throw new NotFoundException('CAD file not found');

    cad.status     = CadFileStatus.APPROVED;
    cad.approvedAt = new Date();
    cad.approvedBy = order.customerEmail;
    await this.cadRepo.save(cad);

    order.customerEmailApproval = true;
    await this.orderRepo.save(order);

    // Notify team
    const staff = await this.userRepo.find({
      where: [{ role: UserRole.ADMIN }, { role: UserRole.AUTHORIZER }, { role: UserRole.CAD_DESIGNER }],
    });
    await Promise.all(staff.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type:         NotificationType.CAD_APPROVED,
        title:        `Customer Approved CAD — ${order.poNumber}`,
        message:      `${order.customerFullName} approved the CAD design.`,
        orderId:      order.id,
        targetUserId: u.id,
      })),
    ));

    const staffEmails = staff.map(u => u.email).filter(Boolean);
    if (staffEmails.length) {
      this.emailService.sendCustomerApprovedCadToTeam({
        to:           staffEmails,
        poNumber:     order.poNumber,
        customerName: order.customerFullName,
        orderType:    order.orderType || 'Custom Order',
        orderId:      order.id,
      }).catch(err => this.logger.warn('CAD approved email failed:', err));
    }

    return { success: true, message: 'Design approved. Our team has been notified.' };
  }

  // ── Customer rejects a CAD file ───────────────────────────────────────
  async rejectCad(token: string, cadId: string, feedback: string) {
    const order = await this.orderRepo.findOne({ where: { trackingToken: token } });
    if (!order) throw new NotFoundException('Order not found');

    const cad = await this.cadRepo.findOne({ where: { id: cadId, orderId: order.id } });
    if (!cad) throw new NotFoundException('CAD file not found');

    cad.status           = CadFileStatus.REVISION_REQUESTED;
    cad.customerFeedback = feedback || 'Customer requested changes.';
    await this.cadRepo.save(cad);

    // Notify CAD designers + admins
    const staff = await this.userRepo.find({
      where: [{ role: UserRole.ADMIN }, { role: UserRole.CAD_DESIGNER }],
    });
    await Promise.all(staff.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type:         NotificationType.CAD_REJECTED,
        title:        `CAD Revision Requested — ${order.poNumber}`,
        message:      `${order.customerFullName} requested changes: "${cad.customerFeedback}"`,
        orderId:      order.id,
        targetUserId: u.id,
      })),
    ));

    const staffEmails = staff.map(u => u.email).filter(Boolean);
    if (staffEmails.length) {
      this.emailService.sendCadRevisionAlert({
        to:           staffEmails,
        poNumber:     order.poNumber,
        customerName: order.customerFullName,
        orderType:    order.orderType || 'Custom Order',
        orderId:      order.id,
      }).catch(err => this.logger.warn('CAD revision email failed:', err));
    }

    return { success: true, message: 'Revision requested. Our design team will update the CAD shortly.' };
  }
}
