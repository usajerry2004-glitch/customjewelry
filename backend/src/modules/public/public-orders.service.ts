import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Company } from '../../database/entities/company.entity';
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
  hasGemstone?: boolean;

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

const STALL_REASONS = ['WAITING_ON_CUSTOMER', 'PRICE_ISSUE', 'NOT_INTERESTED'];
const STALL_SUB_REASONS = ['CUSTOMER_CANCELLED', 'OTHER'];

const STALL_REASON_LABELS: Record<string, string> = {
  WAITING_ON_CUSTOMER: 'Still waiting on their own customer to approve',
  PRICE_ISSUE: "There's a price concern",
};

function describeStallAnswer(reason: string, subReason?: string | null): string {
  if (reason === 'NOT_INTERESTED') {
    return subReason === 'CUSTOMER_CANCELLED'
      ? 'No longer interested — their customer cancelled'
      : 'No longer interested — other reason';
  }
  return STALL_REASON_LABELS[reason] || reason;
}

function isValidRating(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

@Injectable()
export class PublicOrdersService {
  private readonly logger = new Logger(PublicOrdersService.name);

  constructor(
    @InjectRepository(Order)        private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)         private readonly userRepo: Repository<User>,
    @InjectRepository(Company)      private readonly companyRepo: Repository<Company>,
    @InjectRepository(CadFile)      private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    private readonly emailService: EmailService,
    private readonly spacesService: SpacesService,
    private readonly ordersService: OrdersService,
  ) {}

  // ── Find or create customer by email ─────────────────────────────────
  private async findOrCreateCustomer(dto: WebOrderDto): Promise<User> {
    const email = dto.email.toLowerCase().trim();
    // Case-insensitive on purpose — an exact match here would risk creating a
    // second account for an existing customer whose email happens to be
    // stored with different casing (same class of bug fixed elsewhere for
    // login/invite), which for a fixed partner address like this one would
    // silently start splitting their orders across two accounts.
    const existing = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email })
      .getOne();
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
        hasGemstone:      dto.hasGemstone ?? false,
        referenceWeblink: dto.referenceWeblink,
        refCustomerPo:    dto.refCustomerPo,
        stockNumber:      dto.stockNumber,
        customerNotes:    dto.customerNotes,
        salesRepName:     'Web Order',
        // If this customer is already assigned to a sales rep, attribute the
        // order to them so it shows up in that rep's view even though the
        // customer submitted it directly through the website.
        salesRepId:       customer.salesRepId || undefined,
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

      // Notify CAD team + Authorizers (Admins only get notified when tagged in the order's conversation)
      const staff = await this.userRepo.find({
        where: [{ role: UserRole.CAD_DESIGNER }, { role: UserRole.AUTHORIZER }],
      });
      await Promise.all(staff.map(u =>
        this.notifRepo.save(this.notifRepo.create({
          type: NotificationType.ORDER_CREATED,
          title: `New Web Order — ${order.poNumber}`,
          message: `A new order from ${dto.storeName || dto.firstName + ' ' + dto.lastName} was submitted via the website.`,
          orderId: order.id,
          targetUserId: u.id,
          isPriority: order.isPriorityCustomer,
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
          isPriorityCustomer: order.isPriorityCustomer,
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

    const company = order.companyId ? await this.companyRepo.findOne({ where: { id: order.companyId } }) : null;

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
      hasGemstone:    order.hasGemstone,
      customerNotes:  order.customerNotes,
      refCustomerPo:  order.refCustomerPo ?? null,
      createdAt:      order.createdAt,
      updatedAt:      order.updatedAt,
      trackingNumber: order.trackingNumber,
      shipMethod:     order.shipMethod,
      quotedCost:     order.quotedCost ?? null,
      quoteOptions:   order.quoteOptions ?? null,
      committedShipDate: order.committedShipDate ?? null,
      viewerAccessEnabled: company?.viewerAccessEnabled ?? false,
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

    // Notify the whole Authorizer team (no per-order authorizer is assigned) plus
    // only the designer who actually uploaded this CAD file — not every CAD_DESIGNER.
    const authorizers = await this.userRepo.find({ where: { role: UserRole.AUTHORIZER } });
    const designer = cad.uploadedBy
      ? await this.userRepo.findOne({ where: { email: cad.uploadedBy, role: UserRole.CAD_DESIGNER } })
      : null;
    const staff = designer ? [...authorizers, designer] : authorizers;
    await Promise.all(staff.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type:         NotificationType.CAD_APPROVED,
        title:        `Customer Approved CAD — ${order.poNumber}`,
        message:      `${order.customerFullName} approved the CAD design.`,
        orderId:      order.id,
        targetUserId: u.id,
        isPriority:   order.isPriorityCustomer,
      })),
    ));

    // Email only the designer — Authorizer shouldn't get any CAD-related email.
    if (designer?.email) {
      this.emailService.sendCustomerApprovedCadToTeam({
        to:           [designer.email],
        poNumber:     order.poNumber,
        customerName: order.customerFullName,
        orderType:    order.orderType || 'Custom Order',
        orderId:      order.id,
        isPriorityCustomer: order.isPriorityCustomer,
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

    // Only the designer who uploaded this CAD file needs to act on it — not
    // every CAD_DESIGNER on the team.
    const staff = cad.uploadedBy
      ? await this.userRepo.find({ where: { email: cad.uploadedBy, role: UserRole.CAD_DESIGNER } })
      : [];
    await Promise.all(staff.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type:         NotificationType.CAD_REJECTED,
        title:        `CAD Revision Requested — ${order.poNumber}`,
        message:      `${order.customerFullName} requested changes: "${cad.customerFeedback}"`,
        orderId:      order.id,
        targetUserId: u.id,
        isPriority:   order.isPriorityCustomer,
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
        isPriorityCustomer: order.isPriorityCustomer,
      }).catch(err => this.logger.warn('CAD revision email failed:', err));
    }

    return { success: true, message: 'Revision requested. Our design team will update the CAD shortly.' };
  }

  // ── Approval-stall check-in survey ────────────────────────────────────
  // Minimal, no-login context for the /survey/:token page — deliberately a
  // much smaller payload than getOrderByToken since this page only ever
  // needs to show what the customer is being asked about, not the full
  // order/CAD history.
  async getSurveyContext(token: string) {
    const order = await this.orderRepo.findOne({ where: { trackingToken: token } });
    if (!order) throw new NotFoundException('Order not found');

    return {
      poNumber: order.poNumber,
      orderType: order.orderType,
      metalType: order.metalType,
      metalColor: order.metalColor,
      centerStoneShape: order.centerStoneShape,
      diamondQuality: order.diamondQuality,
      alreadyResponded: !!order.approvalStallRespondedAt,
      isReminder: !!order.approvalStallReminderSentAt,
      sentAt: order.approvalStallSurveySentAt,
      reminderAt: order.approvalStallReminderSentAt,
    };
  }

  async submitApprovalStallSurvey(token: string, reason: string, subReason?: string) {
    const order = await this.orderRepo.findOne({ where: { trackingToken: token } });
    if (!order) throw new NotFoundException('Order not found');

    if (!STALL_REASONS.includes(reason)) {
      throw new BadRequestException(`Invalid reason. Expected one of: ${STALL_REASONS.join(', ')}`);
    }
    if (reason === 'NOT_INTERESTED' && !STALL_SUB_REASONS.includes(subReason || '')) {
      throw new BadRequestException(`subReason is required when reason is NOT_INTERESTED — expected one of: ${STALL_SUB_REASONS.join(', ')}`);
    }

    // Re-submission overwrites the previous answer rather than erroring — a
    // customer changing their mind after re-opening the link shouldn't hit a wall.
    await this.orderRepo.update(order.id, {
      approvalStallReason: reason,
      approvalStallSubReason: reason === 'NOT_INTERESTED' ? (subReason || null) : null,
      approvalStallRespondedAt: new Date(),
    });

    const label = describeStallAnswer(reason, subReason);
    const admins = await this.userRepo.find({ where: { role: UserRole.ADMIN } });

    await Promise.all(admins.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type:         NotificationType.APPROVAL_SURVEY_RESPONSE,
        title:        `Approval Check-In — ${order.poNumber}`,
        message:      `${order.customerFullName || order.storeName || 'Customer'} responded: ${label}`,
        orderId:      order.id,
        targetUserId: u.id,
        isPriority:   order.isPriorityCustomer,
      })),
    ));

    const adminEmails = admins.map(u => u.email).filter(Boolean);
    if (adminEmails.length) {
      this.emailService.sendApprovalStallResponseToAdmins({
        to:           adminEmails,
        poNumber:     order.poNumber,
        customerName: order.customerFullName || order.storeName || 'Customer',
        orderType:    order.orderType || 'Custom Order',
        orderId:      order.id,
        reasonLabel:  label,
      }).catch(err => this.logger.warn('Approval stall response admin email failed:', err));
    }

    return { success: true, message: "Thanks — we've let our team know." };
  }

  // ── Post-completion feedback survey ─────────────────────────────────────
  async getFeedbackContext(token: string) {
    const order = await this.orderRepo.findOne({ where: { trackingToken: token } });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.feedbackRequestedAt) throw new NotFoundException('No feedback request found for this order');

    return {
      poNumber: order.poNumber,
      orderType: order.orderType,
      alreadyResponded: !!order.feedbackRespondedAt,
      experienceRating: order.feedbackExperienceRating,
      priceRating: order.feedbackPriceRating,
      qualityRating: order.feedbackQualityRating,
      comments: order.feedbackComments,
    };
  }

  async submitFeedback(
    token: string,
    experienceRating: unknown,
    priceRating: unknown,
    qualityRating: unknown,
    comments?: string,
  ) {
    const order = await this.orderRepo.findOne({ where: { trackingToken: token } });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.feedbackRequestedAt) throw new BadRequestException('No feedback request found for this order');

    if (!isValidRating(experienceRating) || !isValidRating(priceRating) || !isValidRating(qualityRating)) {
      throw new BadRequestException('experienceRating, priceRating, and qualityRating are all required — integers from 1 to 5.');
    }
    const trimmedComments = (comments || '').trim().slice(0, 2000) || null;

    // Re-submission overwrites the previous answer, same reasoning as the
    // approval-stall survey — a customer re-opening the link to add a comment
    // they forgot shouldn't hit a wall.
    await this.orderRepo.update(order.id, {
      feedbackExperienceRating: experienceRating,
      feedbackPriceRating: priceRating,
      feedbackQualityRating: qualityRating,
      feedbackComments: trimmedComments,
      feedbackRespondedAt: new Date(),
    });

    const ratingsSummary = `Experience ${experienceRating}/5 · Price ${priceRating}/5 · Quality ${qualityRating}/5`;
    const admins = await this.userRepo.find({ where: { role: UserRole.ADMIN } });

    await Promise.all(admins.map(u =>
      this.notifRepo.save(this.notifRepo.create({
        type:         NotificationType.FEEDBACK_RECEIVED,
        title:        `Feedback Received — ${order.poNumber}`,
        message:      `${order.customerFullName || order.storeName || 'Customer'} rated: ${ratingsSummary}`,
        orderId:      order.id,
        targetUserId: u.id,
        isPriority:   order.isPriorityCustomer,
      })),
    ));

    const adminEmails = admins.map(u => u.email).filter(Boolean);
    if (adminEmails.length) {
      this.emailService.sendFeedbackResponseToAdmins({
        to:             adminEmails,
        poNumber:       order.poNumber,
        customerName:   order.customerFullName || order.storeName || 'Customer',
        orderType:      order.orderType || 'Custom Order',
        orderId:        order.id,
        ratingsSummary,
        comments:       trimmedComments,
      }).catch(err => this.logger.warn('Feedback response admin email failed:', err));
    }

    return { success: true, message: 'Thank you for your feedback!' };
  }
}
