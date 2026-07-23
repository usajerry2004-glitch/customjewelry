import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Request, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';
import { OrdersService, OrderFilterDto } from './orders.service';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { UpdateStatusDto, AssignSupplierDto, BulkAssignSupplierDto } from './update-status.dto';
import { UpdateQuoteOptionsDto } from './dto/quote-options.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresPermission } from '../../common/decorators/permission.decorator';
import { Permission } from '../../common/permissions';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { FactoryRedactionInterceptor } from '../../common/interceptors/factory-redaction.interceptor';

class BulkStatusDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  orderIds: string[];

  @IsString()
  status: string;
}

class BulkOrderIdsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  orderIds: string[];
}

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
@UseInterceptors(FactoryRedactionInterceptor)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Get orders (role-filtered)' })
  findAll(@Query() filters: OrderFilterDto, @Request() req: any) {
    return this.ordersService.findAll(filters, req.user);
  }

  @Get('priority')
  @ApiOperation({ summary: 'Get priority orders for current user role' })
  findPriority(@Request() req: any) {
    return this.ordersService.findPriority(req.user);
  }

  @Get('kanban')
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Kanban board' })
  kanban(@Request() req: any) {
    return this.ordersService.getKanbanBoard(req.user);
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Order metrics' })
  metrics() {
    return this.ordersService.getMetrics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.findOne(id, req.user);
  }

  @Post()
  @ApiOperation({ summary: 'Create new order' })
  create(@Body() dto: Partial<Order>, @Request() req: any) {
    return this.ordersService.create(dto, req.user);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Update order' })
  update(@Param('id') id: string, @Body() dto: Partial<Order>, @Request() req: any) {
    return this.ordersService.update(id, dto, req.user);
  }

  @Patch('bulk/status')
  @Roles(UserRole.FACTORY_MANAGER, UserRole.ADMIN, UserRole.AUTHORIZER)
  @RequiresPermission(Permission.BULK_STATUS_NUDGE)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Bulk move orders to a status (Factory Manager: Manufactured only; Admin/Authorizer: any allowed transition, same rules as the single-order endpoint)' })
  async bulkUpdateStatus(
    @Body() body: BulkStatusDto,
    @Request() req: any,
  ) {
    const results = await Promise.allSettled(
      body.orderIds.map(id => this.ordersService.updateStatus(id, body.status as any, req.user)),
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    return { succeeded, failed };
  }

  @Patch('bulk/cancel')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.SALES_REP)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Bulk cancel orders (Admin/Authorizer/Sales Rep)' })
  async bulkCancel(
    @Body() body: BulkOrderIdsDto,
    @Request() req: any,
  ) {
    const results = await Promise.allSettled(
      body.orderIds.map(id => this.ordersService.updateStatus(id, OrderStatus.CANCELLED, req.user)),
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    return { succeeded, failed };
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Update order status (quotedCost required when issuing the VPO)' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
    @Request() req: any,
  ) {
    return this.ordersService.updateStatus(id, body.status, req.user, body.quotedCost, body.repairContractor);
  }

  @Patch(':id/assign-supplier')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @RequiresPermission(Permission.ASSIGN_SUPPLIER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Assign a factory and stone supplier to a VPO-issued order — only then is it visible to the assigned Factory/Stone Manager' })
  assignSupplier(
    @Param('id') id: string,
    @Body() body: AssignSupplierDto,
    @Request() req: any,
  ) {
    return this.ordersService.assignSupplier(id, body.factory, body.supplySource, req.user);
  }

  @Patch('bulk/assign-supplier')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @RequiresPermission(Permission.ASSIGN_SUPPLIER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Bulk assign a factory and stone supplier to multiple VPO-issued orders (Admin/Authorizer only)' })
  async bulkAssignSupplier(
    @Body() body: BulkAssignSupplierDto,
    @Request() req: any,
  ) {
    const results = await Promise.allSettled(
      body.orderIds.map(id => this.ordersService.assignSupplier(id, body.factory, body.supplySource, req.user)),
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    return { succeeded, failed };
  }

  @Patch(':id/quote-options')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Set the list of price options shown to the customer while they decide' })
  updateQuoteOptions(
    @Param('id') id: string,
    @Body() body: UpdateQuoteOptionsDto,
    @Request() req: any,
  ) {
    return this.ordersService.updateQuoteOptions(id, body.options, req.user);
  }

  @Patch(':id/authorize')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Authorize order — notifies CAD team' })
  authorize(@Param('id') id: string) {
    return this.ordersService.authorize(id);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Get audit log for an order' })
  getEvents(@Param('id') id: string) {
    return this.ordersService.getEvents(id);
  }

  @Delete('bulk')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @RequiresPermission(Permission.BULK_DELETE_ORDERS)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Permanently delete multiple orders and all related records (Admin/Authorizer only)' })
  async bulkRemove(
    @Body() body: BulkOrderIdsDto,
    @Request() req: any,
  ) {
    const results = await Promise.allSettled(
      body.orderIds.map(id => this.ordersService.remove(id, req.user)),
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    return { succeeded, failed };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @RequiresPermission(Permission.BULK_DELETE_ORDERS)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Permanently delete an order and all related records (Admin/Authorizer only)' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.remove(id, req.user);
  }
}
