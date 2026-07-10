import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { EmailService } from '../email/email.service';
import { SpacesService } from '../spaces/spaces.service';
import { SkuService } from '../sku/sku.service';

@Injectable()
export class CadService {
  private readonly logger = new Logger(CadService.name);

  constructor(
    @InjectRepository(CadFile)    private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(Order)      private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)       private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    private readonly emailService: EmailService,
    private readonly skuService: SkuService,
    private readonly spacesService: SpacesService,
  ) {}

  private async getTeamEmails(roles: UserRole[]): Promise<{ emails: string[]; users: User[] }> {
    const users = await this.userRepo.find({ where: { role: In(roles) } });
    return { emails: users.map(u => u.email).filter(Boolean), users };
  }

  private async notifyTeam(
    users: User[],
    type: NotificationType,
    title: string,
    message: string,
    orderId: string,
    dedupe = false,
  ): Promise<void> {
    await Promise.all(
      users.map(async u => {
        if (dedupe) {
          const cutoff = new Date(Date.now() - 60_000);
          const recent = await this.notifRepo.findOne({
            where: { type, orderId, targetUserId: u.id, createdAt: MoreThan(cutoff) },
          });
          if (recent) return;
        }
        await this.notifRepo.save(
          this.notifRepo.create({ type, title, message, orderId, targetUserId: u.id }),
        );
      }),
    );
  }

  async upload(
    orderId: string,
    file: Express.Multer.File,
    uploadedBy: string,
    designerNotes?: string,
    cadPersonName?: string,
    verifiedByName?: string,
  ): Promise<CadFile> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (!cadPersonName?.trim() || !verifiedByName?.trim()) {
      throw new BadRequestException('CAD Person Name and Verified By Name are both required.');
    }

    const existing = await this.cadRepo.find({ where: { orderId } });
    const revisionNumber = existing.length + 1;

    const uploaded = await this.spacesService.uploadWithThumbnail(file.buffer, 'cad', file.originalname, file.mimetype);
    const cad = this.cadRepo.create({
      orderId,
      originalName: file.originalname,
      fileName:      uploaded.fileName,
      filePath:      uploaded.filePath,
      thumbnailPath: uploaded.thumbnailPath,
      uploadedBy,
      revisionNumber,
      designerNotes,
      cadPersonName:  cadPersonName.trim(),
      verifiedByName: verifiedByName.trim(),
      status: CadFileStatus.SENT_FOR_APPROVAL,
    });
    return this.cadRepo.save(cad);
  }

  // Called once after all files in a batch are uploaded.
  // Files are held for auth/admin review — NOT automatically sent to customer.
  async notifyBatchUploaded(orderId: string): Promise<void> {
    await this.orderRepo.update(orderId, { cadSubStatus: 'UPLOADED' });
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) return;

    // Admins only get notified when tagged in the order's conversation, not on every batch upload
    const { users: authUsers } = await this.getTeamEmails([UserRole.AUTHORIZER]);
    if (authUsers.length) {
      await this.notifyTeam(authUsers, NotificationType.CAD_SENT_FOR_APPROVAL,
        `CAD Files Ready for Review — ${order.poNumber}`,
        `CAD designer has uploaded file(s) for order ${order.poNumber}. Please review and set the quote price.`,
        order.id);
    }
    const authorizerEmails = authUsers.filter(u => u.role === UserRole.AUTHORIZER).map(u => u.email).filter(Boolean);
    if (authorizerEmails.length) {
      this.emailService.sendCadSentForApprovalToAuthorizers({
        to: authorizerEmails,
        poNumber: order.poNumber,
        customerName: order.customerFullName || order.storeName || 'Valued Customer',
        orderType: order.orderType || '—',
        orderId: order.id,
      }).catch(err => this.logger.warn('CAD sent-for-approval email failed:', err));
    }
  }

  // Auth/Admin explicitly sends CAD files to customer after reviewing price
  async sendToCustomer(orderId: string): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    await this.orderRepo.update(orderId, { sentToCustomer: true });

    // Mark all non-reference design files as SENT_FOR_APPROVAL so the customer portal shows approval buttons
    const allCads = await this.cadRepo.find({ where: { orderId } });
    const designFileIds = allCads.filter(
      c => c.designerNotes !== 'Reference image' && c.designerNotes !== 'Customer reference image'
        && c.status === CadFileStatus.UPLOADED,
    ).map(c => c.id);
    if (designFileIds.length) {
      await this.cadRepo.update({ id: In(designFileIds) }, { status: CadFileStatus.SENT_FOR_APPROVAL });
    }

    if (order.customerEmail) {
      this.emailService.sendCadReadyForApproval({
        to:            order.customerEmail,
        poNumber:      order.poNumber,
        customerName:  order.customerFullName || order.storeName || 'Valued Customer',
        orderType:     order.orderType || '—',
        orderId:       order.id,
        trackingToken: order.trackingToken,
      }).catch(err => this.logger.warn('CAD ready for approval email failed:', err));
    }
  }

  async uploadReference(orderId: string, file: Express.Multer.File, uploadedBy: string): Promise<CadFile> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    const existing = await this.cadRepo.find({ where: { orderId } });
    const uploaded = await this.spacesService.uploadWithThumbnail(file.buffer, 'cad', file.originalname, file.mimetype);
    const cad = this.cadRepo.create({
      orderId,
      originalName: file.originalname,
      fileName:      uploaded.fileName,
      filePath:      uploaded.filePath,
      thumbnailPath: uploaded.thumbnailPath,
      uploadedBy,
      revisionNumber: existing.length + 1,
      designerNotes: 'Reference image',
      status: CadFileStatus.UPLOADED,
    });
    return this.cadRepo.save(cad);
  }

  async getByOrder(orderId: string): Promise<CadFile[]> {
    return this.cadRepo.find({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  async sendForApproval(id: string): Promise<CadFile> {
    const cad = await this.findOne(id);
    cad.status = CadFileStatus.SENT_FOR_APPROVAL;
    const saved = await this.cadRepo.save(cad);
    await this.orderRepo.update(cad.orderId, { status: OrderStatus.CAD_IN_PROGRESS, cadSubStatus: 'UPLOADED' });

    const order = await this.orderRepo.findOne({ where: { id: cad.orderId } });
    if (!order) return saved;

    // Admins only get notified when tagged in the order's conversation, not on every CAD submission
    const { users: saUsers } = await this.getTeamEmails([UserRole.AUTHORIZER]);
    if (saUsers.length) {
      await this.notifyTeam(saUsers, NotificationType.CAD_SENT_FOR_APPROVAL,
        `CAD File Ready for Review — ${order.poNumber}`,
        `CAD design for order ${order.poNumber} has been uploaded. Please review and set the quote price.`,
        order.id);
    }
    const saAuthorizerEmails = saUsers.filter(u => u.role === UserRole.AUTHORIZER).map(u => u.email).filter(Boolean);
    if (saAuthorizerEmails.length) {
      this.emailService.sendCadSentForApprovalToAuthorizers({
        to: saAuthorizerEmails,
        poNumber: order.poNumber,
        customerName: order.customerFullName || order.storeName || 'Valued Customer',
        orderType: order.orderType || '—',
        orderId: order.id,
      }).catch(err => this.logger.warn('CAD sent-for-approval email failed:', err));
    }

    return saved;
  }

  async approve(id: string, approvedBy: string): Promise<CadFile> {
    const cad = await this.findOne(id);
    cad.status = CadFileStatus.APPROVED;
    cad.approvedAt = new Date();
    cad.approvedBy = approvedBy;
    const saved = await this.cadRepo.save(cad);
    await this.orderRepo.update(cad.orderId, { customerEmailApproval: true, cadSubStatus: 'APPROVED' });

    const order = await this.orderRepo.findOne({ where: { id: cad.orderId } });
    if (order) {
      // Customer approval auto-generates the SKU and issues the VPO immediately — no manual SKU step.
      const sku = await this.skuService.generate(order.id, approvedBy);
      await this.orderRepo.update(order.id, { status: OrderStatus.VPO_ISSUED });

      const { users: vpoUsers } = await this.getTeamEmails([UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER]);
      if (vpoUsers.length) {
        await this.notifyTeam(vpoUsers, NotificationType.STATUS_CHANGED,
          `VPO Issued — ${order.poNumber}`,
          `Customer approved the CAD for order ${order.poNumber}. SKU ${sku.skuNumber} generated and the order has been issued to the factory.`,
          order.id);
      }
    }

    return saved;
  }

  async reject(id: string, feedback: string): Promise<CadFile> {
    const cad = await this.findOne(id);
    cad.status = CadFileStatus.REJECTED;
    cad.customerFeedback = feedback;
    const saved = await this.cadRepo.save(cad);

    // Customer rejection = order cancelled and deactivated
    await this.orderRepo.update(cad.orderId, { status: OrderStatus.CANCELLED, isArchived: true });

    const order = await this.orderRepo.findOne({ where: { id: cad.orderId } });
    if (order) {
      const { users } = await this.getTeamEmails([UserRole.AUTHORIZER, UserRole.CAD_DESIGNER]);
      if (users.length) {
        await this.notifyTeam(users, NotificationType.CAD_REJECTED,
          `Order Cancelled — ${order.poNumber}`,
          `Customer rejected the CAD for order ${order.poNumber} and the order has been cancelled.`,
          order.id, true);
      }
    }

    return saved;
  }

  async requestRevision(id: string, feedback: string): Promise<CadFile> {
    const cad = await this.findOne(id);
    cad.status = CadFileStatus.REVISION_REQUESTED;
    cad.customerFeedback = feedback;
    const saved = await this.cadRepo.save(cad);
    // Reset sentToCustomer — revised design must go through auth review before customer sees it
    await this.orderRepo.update(cad.orderId, { status: OrderStatus.CAD_IN_PROGRESS, customerEmailApproval: false, cadSubStatus: 'REVISION', sentToCustomer: false });

    const order = await this.orderRepo.findOne({ where: { id: cad.orderId } });
    if (order) {
      const { emails, users } = await this.getTeamEmails([UserRole.CAD_DESIGNER, UserRole.AUTHORIZER]);
      if (users.length) {
        await this.notifyTeam(users, NotificationType.CAD_REJECTED,
          `CAD Revision Requested — ${order.poNumber}`,
          `Revision requested for order ${order.poNumber}: "${feedback}". Please upload a revised design.`,
          order.id, true);
      }
      if (emails.length) {
        this.emailService.sendCadRevisionAlert({
          to: emails,
          poNumber: order.poNumber,
          customerName: order.customerFullName || order.storeName || 'Valued Customer',
          orderType: order.orderType || '—',
          orderId: order.id,
        }).catch(err => this.logger.warn('CAD revision email failed:', err));
      }
    }

    return saved;
  }

  async deleteFile(id: string): Promise<void> {
    const cad = await this.findOne(id);
    if (cad.status === CadFileStatus.APPROVED || cad.status === CadFileStatus.REJECTED) {
      throw new ForbiddenException('Cannot delete a file that has already been approved or rejected');
    }
    await this.cadRepo.delete(id);
  }

  async getAll(): Promise<CadFile[]> {
    return this.cadRepo.find({ order: { createdAt: 'DESC' } });
  }

  async isVisibleToCustomer(orderId: string): Promise<boolean> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    return !!(order?.sentToCustomer);
  }

  async assertCustomerOwnsOrder(orderId: string, customerEmail: string): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order || order.customerEmail !== customerEmail) {
      throw new ForbiddenException('Access denied');
    }
  }

  async assertCustomerOwnsCadFile(cadId: string, customerEmail: string): Promise<void> {
    const cad = await this.findOne(cadId);
    await this.assertCustomerOwnsOrder(cad.orderId, customerEmail);
  }

  async getThumbnails(orderIds: string[]): Promise<Record<string, string>> {
    if (!orderIds.length) return {};
    const cads = await this.cadRepo
      .createQueryBuilder('c')
      .where('c.orderId IN (:...ids)', { ids: orderIds })
      .andWhere(`(c.designerNotes = 'Reference image' OR c.designerNotes = 'Customer reference image')`)
      .orderBy('c.createdAt', 'ASC')
      .getMany();
    const map: Record<string, string> = {};
    for (const cad of cads) {
      if (!map[cad.orderId]) map[cad.orderId] = cad.thumbnailPath || cad.filePath || cad.fileName;
    }
    return map;
  }

  async getStatusCounts(): Promise<Record<string, number>> {
    const rows: { label: string; count: string }[] = await this.orderRepo.query(`
      SELECT
        CASE
          WHEN "cadSubStatus" IS NULL                                         THEN 'PENDING_CAD'
          WHEN "cadSubStatus" = 'REVISION'                                    THEN 'REVISION'
          WHEN "cadSubStatus" = 'UPLOADED' AND "quotedCost" IS NOT NULL       THEN 'AWAITING_APPROVAL'
          WHEN "cadSubStatus" = 'UPLOADED' AND "quotedCost" IS NULL           THEN 'AWAITING_QUOTE'
          ELSE "cadSubStatus"
        END AS label,
        COUNT(*) AS count
      FROM orders
      WHERE status = 'CAD_IN_PROGRESS'
      GROUP BY label
    `);
    const result: Record<string, number> = {};
    for (const row of rows) result[row.label] = parseInt(row.count, 10);
    return result;
  }

  private async findOne(id: string): Promise<CadFile> {
    const cad = await this.cadRepo.findOne({ where: { id } });
    if (!cad) throw new NotFoundException(`CAD file ${id} not found`);
    return cad;
  }
}
