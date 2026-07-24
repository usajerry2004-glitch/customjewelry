import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, IsNull } from 'typeorm';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { CadTimeLog } from '../../database/entities/cad-time-log.entity';
import { EmailService } from '../email/email.service';
import { SpacesService } from '../spaces/spaces.service';
import { SkuService } from '../sku/sku.service';

const MAX_REFERENCE_IMAGES = 4;

// Admin can upload/send CAD files at any order stage (e.g. adding a revised
// reference after the VPO is already issued), but that shouldn't regress the
// order back into the CAD approval flow once it's moved past it.
const PRE_VPO_STATUSES: OrderStatus[] = [OrderStatus.NEW, OrderStatus.CAD_IN_PROGRESS];

@Injectable()
export class CadService {
  private readonly logger = new Logger(CadService.name);

  constructor(
    @InjectRepository(CadFile)    private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(Order)      private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)       private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    @InjectRepository(CadTimeLog) private readonly timeLogRepo: Repository<CadTimeLog>,
    private readonly emailService: EmailService,
    private readonly skuService: SkuService,
    private readonly spacesService: SpacesService,
  ) {}

  // ── Work-time tracking ────────────────────────────────────────────────
  // Raw start/stop log only — no duration is ever returned to the frontend
  // beyond "is a session currently running", so nothing here surfaces on the
  // portal. A later weekly report will aggregate durationSeconds directly
  // from the table.

  async startTimer(orderId: string, userId: string): Promise<{ running: true }> {
    const open = await this.timeLogRepo.findOne({ where: { orderId, userId, stoppedAt: IsNull() } });
    if (open) return { running: true };
    await this.timeLogRepo.save(this.timeLogRepo.create({ orderId, userId, startedAt: new Date() }));
    return { running: true };
  }

  async stopTimer(orderId: string, userId: string): Promise<{ running: false }> {
    const open = await this.timeLogRepo.findOne({ where: { orderId, userId, stoppedAt: IsNull() } });
    if (!open) throw new BadRequestException('No active work session for this order.');
    const stoppedAt = new Date();
    open.stoppedAt = stoppedAt;
    open.durationSeconds = Math.round((stoppedAt.getTime() - open.startedAt.getTime()) / 1000);
    await this.timeLogRepo.save(open);
    return { running: false };
  }

  async getTimerStatus(orderId: string, userId: string): Promise<{ running: boolean }> {
    const open = await this.timeLogRepo.findOne({ where: { orderId, userId, stoppedAt: IsNull() } });
    return { running: !!open };
  }

  private async getTeamEmails(roles: UserRole[]): Promise<{ emails: string[]; users: User[] }> {
    const users = await this.userRepo.find({ where: { role: In(roles) } });
    return { emails: users.map(u => u.email).filter(Boolean), users };
  }

  // In-app: the whole Authorizer team still gets these (no per-order authorizer
  // is assigned) plus the designer who actually uploaded this CAD file — not
  // every CAD_DESIGNER. Kept separate so callers can still email just the
  // designer — Authorizer shouldn't get any CAD-related email.
  private async getAuthorizersAndCadDesigner(uploadedByEmail?: string | null): Promise<{ authUsers: User[]; designer: User | null }> {
    const { users: authUsers } = await this.getTeamEmails([UserRole.AUTHORIZER]);
    const designer = uploadedByEmail
      ? await this.userRepo.findOne({ where: { email: uploadedByEmail, role: UserRole.CAD_DESIGNER } })
      : null;
    return { authUsers, designer };
  }

  private async notifyTeam(
    users: User[],
    type: NotificationType,
    title: string,
    message: string,
    orderId: string,
    dedupe = false,
    isPriority = false,
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
          this.notifRepo.create({ type, title, message, orderId, targetUserId: u.id, isPriority }),
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
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) return;

    // Once the order has moved past the CAD approval stage (VPO issued or
    // later), an Admin uploading an additional/revised file shouldn't pull it
    // back into the "awaiting quote" queue or prompt the team to set a price
    // that's already been set.
    if (!PRE_VPO_STATUSES.includes(order.status)) return;

    await this.orderRepo.update(orderId, { cadSubStatus: 'UPLOADED' });

    // Admin + Authorizer both need to review and set the quote price before this
    // goes to the customer.
    const { users: authUsers } = await this.getTeamEmails([UserRole.AUTHORIZER, UserRole.ADMIN]);
    if (authUsers.length) {
      await this.notifyTeam(authUsers, NotificationType.CAD_SENT_FOR_APPROVAL,
        `CAD Files Ready for Review — ${order.poNumber}`,
        `CAD designer has uploaded file(s) for order ${order.poNumber}. Please review and set the quote price.`,
        order.id, false, order.isPriorityCustomer);
    }
    // Email only Admin — Authorizer still sees the in-app notification above but
    // shouldn't be emailed to set the quote price.
    const adminEmails = authUsers.filter(u => u.role === UserRole.ADMIN).map(u => u.email).filter(Boolean);
    if (adminEmails.length) {
      this.emailService.sendCadSentForApprovalToAuthorizers({
        to: adminEmails,
        poNumber: order.poNumber,
        customerName: order.customerFullName || order.storeName || 'Valued Customer',
        orderType: order.orderType || '—',
        orderId: order.id,
        isPriorityCustomer: order.isPriorityCustomer,
      }).catch(err => this.logger.warn('CAD sent-for-approval email failed:', err));
    }
  }

  // Auth/Admin explicitly sends CAD files to customer after reviewing price
  async sendToCustomer(orderId: string): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    await this.orderRepo.update(orderId, { sentToCustomer: true, lastApprovalEmailAt: new Date() });

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

  // Admin/Authorizer manually nudges a customer who hasn't approved/rejected yet.
  // Rate-limited to once per 24h (checked against the last approval or reminder email).
  async sendApprovalReminder(orderId: string): Promise<{ sent: true }> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status !== OrderStatus.CAD_IN_PROGRESS || !order.sentToCustomer) {
      throw new BadRequestException('This order is not currently awaiting customer approval.');
    }
    if (order.lastApprovalEmailAt) {
      const hoursSince = (Date.now() - new Date(order.lastApprovalEmailAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        throw new BadRequestException(`A reminder was already sent recently. Try again in ${Math.ceil(24 - hoursSince)}h.`);
      }
    }
    if (!order.customerEmail) {
      throw new BadRequestException('This order has no customer email on file.');
    }

    await this.emailService.sendCadApprovalReminder({
      to:            order.customerEmail,
      poNumber:      order.poNumber,
      customerName:  order.customerFullName || order.storeName || 'Valued Customer',
      orderType:     order.orderType || '—',
      orderId:       order.id,
      trackingToken: order.trackingToken,
    });
    await this.orderRepo.update(orderId, { lastApprovalEmailAt: new Date() });
    return { sent: true };
  }

  async uploadReference(orderId: string, file: Express.Multer.File, uploadedBy: string): Promise<CadFile> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    const existing = await this.cadRepo.find({ where: { orderId } });
    const existingRefCount = existing.filter(
      c => c.designerNotes === 'Reference image' || c.designerNotes === 'Customer reference image',
    ).length;
    if (existingRefCount >= MAX_REFERENCE_IMAGES) {
      throw new BadRequestException(`Maximum of ${MAX_REFERENCE_IMAGES} reference images allowed per order.`);
    }
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

    const order = await this.orderRepo.findOne({ where: { id: cad.orderId } });
    if (!order) return saved;

    // Once the order has moved past the CAD approval stage (VPO issued or
    // later), sending an additional/revised file shouldn't regress the order
    // back into CAD_IN_PROGRESS or prompt the team to re-quote it.
    if (!PRE_VPO_STATUSES.includes(order.status)) return saved;

    await this.orderRepo.update(cad.orderId, { status: OrderStatus.CAD_IN_PROGRESS, cadSubStatus: 'UPLOADED' });

    // Admin + Authorizer both need to review and set the quote price before this
    // goes to the customer.
    const { users: saUsers } = await this.getTeamEmails([UserRole.AUTHORIZER, UserRole.ADMIN]);
    if (saUsers.length) {
      await this.notifyTeam(saUsers, NotificationType.CAD_SENT_FOR_APPROVAL,
        `CAD File Ready for Review — ${order.poNumber}`,
        `CAD design for order ${order.poNumber} has been uploaded. Please review and set the quote price.`,
        order.id, false, order.isPriorityCustomer);
    }
    // Email only Admin — Authorizer still sees the in-app notification above but
    // shouldn't be emailed to set the quote price.
    const saAdminEmails = saUsers.filter(u => u.role === UserRole.ADMIN).map(u => u.email).filter(Boolean);
    if (saAdminEmails.length) {
      this.emailService.sendCadSentForApprovalToAuthorizers({
        to: saAdminEmails,
        poNumber: order.poNumber,
        customerName: order.customerFullName || order.storeName || 'Valued Customer',
        orderType: order.orderType || '—',
        orderId: order.id,
        isPriorityCustomer: order.isPriorityCustomer,
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
      await this.orderRepo.update(order.id, { status: OrderStatus.VPO_ISSUED, vpoIssuedAt: new Date() });

      // Order is VPO_ISSUED but not yet routed to any factory/stone supplier —
      // Admin/Authorizer must complete "Assign Supplier" before it's visible to
      // any Factory/Stone Manager. Same two-step flow as the manual VPO path in
      // orders.service.ts.
      const { users: assignerUsers } = await this.getTeamEmails([UserRole.ADMIN, UserRole.AUTHORIZER]);
      if (assignerUsers.length) {
        await this.notifyTeam(assignerUsers, NotificationType.STATUS_CHANGED,
          `Assign Supplier — ${order.poNumber}`,
          `Customer approved the CAD for order ${order.poNumber}. SKU ${sku.skuNumber} generated. Select a stone supplier and factory to release it to production.`,
          order.id, false, order.isPriorityCustomer);
      }
      // Email only Admin — Authorizer still sees the in-app notification above but
      // shouldn't be emailed to assign the supplier.
      const assignerAdminEmails = assignerUsers.filter(u => u.role === UserRole.ADMIN).map(u => u.email).filter(Boolean);
      this.emailService.sendAssignSupplierAlert({
        to: assignerAdminEmails,
        poNumber: order.poNumber,
        orderType: order.orderType || '—',
        orderId: order.id,
        isPriorityCustomer: order.isPriorityCustomer,
      }).catch(err => this.logger.warn('Assign supplier alert email failed:', err));
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
      const { authUsers, designer } = await this.getAuthorizersAndCadDesigner(cad.uploadedBy);
      const users = designer ? [...authUsers, designer] : authUsers;
      if (users.length) {
        await this.notifyTeam(users, NotificationType.CAD_REJECTED,
          `Order Cancelled — ${order.poNumber}`,
          `Customer rejected the CAD for order ${order.poNumber} and the order has been cancelled.`,
          order.id, true, order.isPriorityCustomer);
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
      const { authUsers, designer } = await this.getAuthorizersAndCadDesigner(cad.uploadedBy);
      const users = designer ? [...authUsers, designer] : authUsers;
      if (users.length) {
        await this.notifyTeam(users, NotificationType.CAD_REJECTED,
          `CAD Revision Requested — ${order.poNumber}`,
          `Revision requested for order ${order.poNumber}: "${feedback}". Please upload a revised design.`,
          order.id, true, order.isPriorityCustomer);
      }
      // Email only the designer — Authorizer shouldn't get any CAD-related email.
      if (designer?.email) {
        this.emailService.sendCadRevisionAlert({
          to: [designer.email],
          poNumber: order.poNumber,
          customerName: order.customerFullName || order.storeName || 'Valued Customer',
          orderType: order.orderType || '—',
          orderId: order.id,
          isPriorityCustomer: order.isPriorityCustomer,
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

  async assertCustomerOwnsOrder(orderId: string, customer: { email: string; id?: string; companyId?: string | null }): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    const owns = !!order && (
      order.customerEmail === customer.email ||
      order.customerId === customer.id ||
      !!(customer.companyId && order.companyId === customer.companyId)
    );
    if (!owns) throw new ForbiddenException('Access denied');
  }

  async assertCustomerOwnsCadFile(cadId: string, customer: { email: string; id?: string; companyId?: string | null }): Promise<void> {
    const cad = await this.findOne(cadId);
    await this.assertCustomerOwnsOrder(cad.orderId, customer);
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

  async getDownloadable(id: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string; filename: string }> {
    const cad = await this.findOne(id);
    const obj = await this.spacesService.getObject(cad.fileName);
    return {
      stream: obj.Body as unknown as NodeJS.ReadableStream,
      contentType: obj.ContentType || 'application/octet-stream',
      filename: cad.originalName,
    };
  }
}
