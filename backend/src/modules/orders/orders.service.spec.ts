import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { Notification } from '../../database/entities/notification.entity';
import { CadFile } from '../../database/entities/cad-file.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { OrderMessage } from '../../database/entities/order-message.entity';
import { Sku } from '../../database/entities/sku.entity';
import { Company } from '../../database/entities/company.entity';
import { CustomerCode } from '../../database/entities/customer-code.entity';
import { EmailService } from '../email/email.service';
import { SkuService } from '../sku/sku.service';
import { CatalogService } from '../catalog/catalog.service';

const makeRepo = (overrides: any = {}) => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn(d => d),
  save: jest.fn(d => Promise.resolve({ ...d, id: 'order-1' })),
  update: jest.fn().mockResolvedValue({}),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  createQueryBuilder: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
  }),
  ...overrides,
});

const ADMIN_USER = { id: 'u1', email: 'admin@test.com', role: 'ADMIN' };

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepo: any;

  const makeOrder = (status: OrderStatus): Order => ({
    id: 'order-1',
    poNumber: 'CO10001',
    status,
    customerEmail: 'customer@test.com',
    quotedCost: 500,
  } as any);

  beforeEach(async () => {
    orderRepo = makeRepo();

    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order),        useValue: orderRepo },
        { provide: getRepositoryToken(User),         useValue: makeRepo() },
        { provide: getRepositoryToken(Notification), useValue: makeRepo() },
        { provide: getRepositoryToken(CadFile),      useValue: makeRepo() },
        { provide: getRepositoryToken(OrderEvent),   useValue: makeRepo() },
        { provide: getRepositoryToken(OrderMessage), useValue: makeRepo() },
        { provide: getRepositoryToken(Sku),          useValue: makeRepo() },
        { provide: getRepositoryToken(Company),      useValue: makeRepo() },
        { provide: getRepositoryToken(CustomerCode), useValue: makeRepo() },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: CatalogService, useValue: { isValidKey: jest.fn().mockResolvedValue(true), findAll: jest.fn().mockResolvedValue([]), create: jest.fn() } },
        { provide: EmailService, useValue: {
          sendOrderInProduction:      jest.fn().mockResolvedValue(true),
          sendVpoIssuedNotice:        jest.fn().mockResolvedValue(true),
          sendNewOrderToAuthorizers:  jest.fn().mockResolvedValue(true),
          sendOrderPlaced:            jest.fn().mockResolvedValue(true),
          sendCadRevisionAlert:       jest.fn().mockResolvedValue(true),
          sendCadReadyForApproval:    jest.fn().mockResolvedValue(true),
          sendPendingCadToDesigners:  jest.fn().mockResolvedValue(true),
          sendOrderConfirmedToCustomer: jest.fn().mockResolvedValue(true),
          sendOrderShipped:           jest.fn().mockResolvedValue(true),
          sendOrderDelivered:         jest.fn().mockResolvedValue(true),
        } },
        { provide: SkuService, useValue: { generate: jest.fn().mockResolvedValue({ skuNumber: 'CJ-TEST' }) } },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('updateStatus — transition guard', () => {
    it('allows NEW → CAD_IN_PROGRESS', async () => {
      const order = makeOrder(OrderStatus.NEW);
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: OrderStatus.CAD_IN_PROGRESS });
      const result = await service.updateStatus('order-1', OrderStatus.CAD_IN_PROGRESS, ADMIN_USER);
      expect(result.status).toBe(OrderStatus.CAD_IN_PROGRESS);
    });

    it('rejects invalid transition NEW → COMPLETED', async () => {
      const order = makeOrder(OrderStatus.NEW);
      orderRepo.findOne.mockResolvedValue(order);
      await expect(service.updateStatus('order-1', OrderStatus.COMPLETED, ADMIN_USER))
        .rejects.toThrow(BadRequestException);
    });

    it('rejects CUSTOMER trying to change status', async () => {
      const order = makeOrder(OrderStatus.NEW);
      orderRepo.findOne.mockResolvedValue(order);
      await expect(service.updateStatus('order-1', OrderStatus.CAD_IN_PROGRESS, { id: 'c1', email: 'c@test.com', role: 'CUSTOMER' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('allows cancellation from any active status', async () => {
      for (const status of [OrderStatus.NEW, OrderStatus.CAD_IN_PROGRESS, OrderStatus.VPO_ISSUED]) {
        const order = makeOrder(status);
        orderRepo.findOne.mockResolvedValue(order);
        orderRepo.save.mockResolvedValue({ ...order, status: OrderStatus.CANCELLED, isArchived: true });
        const result = await service.updateStatus('order-1', OrderStatus.CANCELLED, ADMIN_USER);
        expect(result.status).toBe(OrderStatus.CANCELLED);
      }
    });
  });
});
