import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User, UserRole } from '../../database/entities/user.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class CadService {
  constructor(
    @InjectRepository(CadFile)    private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(Order)      private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)       private readonly userRepo: Repository<User>,
    @InjectRepository(Notification) private readonly notifRepo: Repository<Notification>,
    private readonly emailService: EmailService,
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
  ): Promise<void> {
    await Promise.all(
      users.map(u =>
        this.notifRepo.save(
          this.notifRepo.create({ type, title, message, orderId, targetUserId: u.id }),
        ),
      ),
    );
  }

  async upload(orderId: string, file: Express.Multer.File, uploadedBy: string, designerNotes?: string): Promise<CadFile> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const existing = await this.cadRepo.find({ where: { orderId } });
    const revisionNumber = existing.length + 1;

    const cad = this.cadRepo.create({
      orderId,
      originalName: file.originalname,
      fileName: file.filename,
      filePath: file.path,
      uploadedBy,
      revisionNumber,
      designerNotes,
      status: CadFileStatus.SENT_FOR_APPROVAL,
    });
    return this.cadRepo.save(cad);
  }

  // Called once after all files in a batch are uploaded
  async notifyBatchUploaded(orderId: string): Promise<void> {
    await this.orderRepo.update(orderId, { status: OrderStatus.CAD_IN_PROGRESS, sentToCustomer: true, cadSubStatus: 'UPLOADED' });
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) return;

    if (order.customerEmail) {
      await this.emailService.sendCadReadyForApproval({
        to: order.customerEmail,
        poNumber: order.poNumber,
        customerName: order.customerFullName || order.storeName || 'Valued Customer',
        orderType: order.orderType || '—',
        orderId: order.id,
      });
    }

    const { users: authUsers } = await this.getTeamEmails([UserRole.AUTHORIZER, UserRole.ADMIN]);
    if (authUsers.length) {
      await this.notifyTeam(authUsers, NotificationType.CAD_SENT_FOR_APPROVAL,
        `CAD Design Ready for Review — ${order.poNumber}`,
        `CAD design(s) for order ${order.poNumber} have been sent to the customer for review.`,
        order.id);
    }
  }

  async uploadReference(orderId: string, file: Express.Multer.File, uploadedBy: string): Promise<CadFile> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    const existing = await this.cadRepo.find({ where: { orderId } });
    const cad = this.cadRepo.create({
      orderId,
      originalName: file.originalname,
      fileName: file.filename,
      filePath: file.path,
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
    await this.orderRepo.update(cad.orderId, { status: OrderStatus.CAD_IN_PROGRESS, sentToCustomer: true });

    const order = await this.orderRepo.findOne({ where: { id: cad.orderId } });
    if (!order) return saved;

    // Email customer: design ready to review
    if (order.customerEmail) {
      await this.emailService.sendCadReadyForApproval({
        to: order.customerEmail,
        poNumber: order.poNumber,
        customerName: order.customerFullName || order.storeName || 'Valued Customer',
        orderType: order.orderType || '—',
        orderId: order.id,
      });
    }

    // In-portal notification for authorizers (no email)
    const { users: authUsers } = await this.getTeamEmails([UserRole.AUTHORIZER, UserRole.ADMIN]);
    if (authUsers.length) {
      await this.notifyTeam(authUsers, NotificationType.CAD_SENT_FOR_APPROVAL,
        `CAD Sent for Approval — ${order.poNumber}`,
        `CAD design for order ${order.poNumber} has been sent to the customer for review.`,
        order.id);
    }

    return saved;
  }

  async approve(id: string, approvedBy: string): Promise<CadFile> {
    const cad = await this.findOne(id);
    cad.status = CadFileStatus.APPROVED;
    cad.approvedAt = new Date();
    cad.approvedBy = approvedBy;
    const saved = await this.cadRepo.save(cad);
    // Stay at CAD_IN_PROGRESS — status moves to SKU_CREATION only after price is added
    await this.orderRepo.update(cad.orderId, { customerEmailApproval: true, cadSubStatus: 'APPROVED' });

    const order = await this.orderRepo.findOne({ where: { id: cad.orderId } });
    if (order) {
      const { emails, users } = await this.getTeamEmails([UserRole.AUTHORIZER, UserRole.ADMIN]);
      if (users.length) {
        await this.notifyTeam(users, NotificationType.CAD_APPROVED,
          `Quote Price Required — ${order.poNumber}`,
          `CAD approved for order ${order.poNumber}. Please add a quote price to move it to SKU Creation.`,
          order.id);
      }
      if (emails.length) {
        await this.emailService.sendPriceRequiredToAuthorizers({
          to: emails,
          poNumber: order.poNumber,
          customerName: order.customerFullName || order.storeName || 'Valued Customer',
          orderType: order.orderType || '—',
          orderId: order.id,
        });
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
      const { users } = await this.getTeamEmails([UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.ADMIN]);
      if (users.length) {
        await this.notifyTeam(users, NotificationType.CAD_REJECTED,
          `Order Cancelled — ${order.poNumber}`,
          `Customer rejected the CAD for order ${order.poNumber} and the order has been cancelled.`,
          order.id);
      }
    }

    return saved;
  }

  async requestRevision(id: string, feedback: string): Promise<CadFile> {
    const cad = await this.findOne(id);
    cad.status = CadFileStatus.REVISION_REQUESTED;
    cad.customerFeedback = feedback;
    const saved = await this.cadRepo.save(cad);
    // Status stays CAD_IN_PROGRESS — CAD person must upload revised file
    await this.orderRepo.update(cad.orderId, { status: OrderStatus.CAD_IN_PROGRESS, customerEmailApproval: false, cadSubStatus: 'REVISION' });

    const order = await this.orderRepo.findOne({ where: { id: cad.orderId } });
    if (order) {
      const { emails, users } = await this.getTeamEmails([UserRole.CAD_DESIGNER, UserRole.AUTHORIZER, UserRole.ADMIN]);
      if (users.length) {
        await this.notifyTeam(users, NotificationType.CAD_REJECTED,
          `CAD Revision Requested — ${order.poNumber}`,
          `Revision requested for order ${order.poNumber}: "${feedback}". Please upload a revised design.`,
          order.id);
      }
      if (emails.length) {
        await this.emailService.sendCadRevisionAlert({
          to: emails,
          poNumber: order.poNumber,
          customerName: order.customerFullName || order.storeName || 'Valued Customer',
          orderType: order.orderType || '—',
          orderId: order.id,
        });
      }
    }

    return saved;
  }

  async getAll(): Promise<CadFile[]> {
    return this.cadRepo.find({ order: { createdAt: 'DESC' } });
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

  private async findOne(id: string): Promise<CadFile> {
    const cad = await this.cadRepo.findOne({ where: { id } });
    if (!cad) throw new NotFoundException(`CAD file ${id} not found`);
    return cad;
  }
}
