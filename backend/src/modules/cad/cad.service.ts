import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CadFile, CadFileStatus } from '../../database/entities/cad-file.entity';
import { Order, OrderStatus } from '../../database/entities/order.entity';

@Injectable()
export class CadService {
  constructor(
    @InjectRepository(CadFile) private readonly cadRepo: Repository<CadFile>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

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
      status: CadFileStatus.UPLOADED,
    });
    const saved = await this.cadRepo.save(cad);

    await this.orderRepo.update(orderId, { status: OrderStatus.PENDING_CAD });
    return saved;
  }

  async getByOrder(orderId: string): Promise<CadFile[]> {
    return this.cadRepo.find({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  async sendForApproval(id: string): Promise<CadFile> {
    const cad = await this.findOne(id);
    cad.status = CadFileStatus.SENT_FOR_APPROVAL;
    const saved = await this.cadRepo.save(cad);
    await this.orderRepo.update(cad.orderId, { status: OrderStatus.CAD_IN_PROGRESS, sentToCustomer: true });
    return saved;
  }

  async approve(id: string, approvedBy: string): Promise<CadFile> {
    const cad = await this.findOne(id);
    cad.status = CadFileStatus.APPROVED;
    cad.approvedAt = new Date();
    cad.approvedBy = approvedBy;
    const saved = await this.cadRepo.save(cad);
    await this.orderRepo.update(cad.orderId, { status: OrderStatus.CUSTOMER_APPROVED, customerEmailApproval: true });
    return saved;
  }

  async reject(id: string, feedback: string): Promise<CadFile> {
    const cad = await this.findOne(id);
    cad.status = CadFileStatus.REJECTED;
    cad.customerFeedback = feedback;
    const saved = await this.cadRepo.save(cad);
    await this.orderRepo.update(cad.orderId, { status: OrderStatus.CUSTOMER_REJECTED });
    return saved;
  }

  async requestRevision(id: string, feedback: string): Promise<CadFile> {
    const cad = await this.findOne(id);
    cad.status = CadFileStatus.REVISION_REQUESTED;
    cad.customerFeedback = feedback;
    const saved = await this.cadRepo.save(cad);
    await this.orderRepo.update(cad.orderId, { status: OrderStatus.PENDING_CAD });
    return saved;
  }

  async getAll(): Promise<CadFile[]> {
    return this.cadRepo.find({ order: { createdAt: 'DESC' } });
  }

  private async findOne(id: string): Promise<CadFile> {
    const cad = await this.cadRepo.findOne({ where: { id } });
    if (!cad) throw new NotFoundException(`CAD file ${id} not found`);
    return cad;
  }
}
