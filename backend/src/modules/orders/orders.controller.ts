import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Request, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
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

  @Get('status-counts')
  @ApiOperation({ summary: 'Count of orders per status tab (same role-scoping and side filters as the list itself), for the count badge on each status pill' })
  getStatusCounts(@Query() filters: OrderFilterDto, @Request() req: any) {
    return this.ordersService.getStatusCounts(filters, req.user);
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

  @Get('nav-counts')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Cheap unscoped counts for the sidebar nav badges (Admin/Authorizer only): total orders, CAD-stage (pending or revision), VPO Issued (manufacturing), pending-stone VPO Issued, and Repair-status orders.' })
  getNavCounts() {
    return this.ordersService.getNavCounts();
  }

  @Get('reports/weekly')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Dashboard report: Mon-Fri order activity (received/approved/cancelled) for the week containing ?weekStart (YYYY-MM-DD), defaults to the current week. Pass ?dateFrom&?dateTo (YYYY-MM-DD) instead for an arbitrary custom range, capped at 92 days.' })
  getWeeklyActivityReport(
    @Query('weekStart') weekStart?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.ordersService.getWeeklyActivityReport(weekStart, dateFrom, dateTo);
  }

  @Get('reports/top-customers')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Dashboard report: top 5 customers for ?month (YYYY-MM, defaults to current month), ranked by ?sortBy=count|amount (defaults to count). Pass ?dateFrom&?dateTo (YYYY-MM-DD) instead for an arbitrary custom range.' })
  getTopCustomersReport(
    @Query('month') month?: string,
    @Query('sortBy') sortBy?: 'count' | 'amount',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.ordersService.getTopCustomersReport(month, sortBy === 'amount' ? 'amount' : 'count', dateFrom, dateTo);
  }

  @Get('reports/top-sales-reps')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Dashboard report: top 5 sales reps by total order count across their customers, for ?month (YYYY-MM, defaults to current month). Pass ?dateFrom&?dateTo (YYYY-MM-DD) instead for an arbitrary custom range.' })
  getTopSalesRepsReport(
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.ordersService.getTopSalesRepsReport(month, dateFrom, dateTo);
  }

  @Get('reports/top-customers/orders')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Drill-down for a Top Customers row: every order for ?customer (exact name as returned by the ranking) in the same ?month or ?dateFrom/?dateTo window.' })
  getTopCustomerOrders(
    @Query('customer') customer: string,
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.ordersService.getTopCustomerOrders(customer, month, dateFrom, dateTo);
  }

  @Get('reports/top-sales-reps/orders')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Drill-down for a Top Sales Reps row: every order under that rep\'s effective ownership (?repId) in the same ?month or ?dateFrom/?dateTo window.' })
  getTopSalesRepOrders(
    @Query('repId') repId: string,
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.ordersService.getTopSalesRepOrders(repId, month, dateFrom, dateTo);
  }

  @Get('export/csv')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: '"Normal Export" — orders as CSV — Admin/Authorizer get every order with all fields; Factory Manager gets only orders assigned to their own factory, with pricing/customer-identity/reference-link fields stripped. Pass status (VPO_ISSUED/MANUFACTURED/COMPLETED, defaults to VPO_ISSUED) to pick which list; date range filters on vpoIssuedAt, not createdAt. Pass orderIds (comma-separated) to export exactly those orders instead, regardless of their status.' })
  async exportCsv(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('orderIds') orderIdsParam: string | undefined,
    @Query('status') status: string | undefined,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const orderIds = orderIdsParam ? orderIdsParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const csv = await this.ordersService.exportVpoIssuedCsv(dateFrom, dateTo, req.user, orderIds, status as OrderStatus);
    const today = new Date().toISOString().slice(0, 10);
    const factorySuffix = req.user?.role === UserRole.FACTORY_MANAGER && req.user?.assignedFactory
      ? `-${String(req.user.assignedFactory).toLowerCase().replace(/_/g, '-')}`
      : '';
    const statusSlug = (status || OrderStatus.VPO_ISSUED).toLowerCase().replace(/_/g, '-');
    const filenamePrefix = orderIds ? 'orders-selected' : `${statusSlug}-orders`;
    const filename = orderIds
      ? `${filenamePrefix}${factorySuffix}-${today}.csv`
      : (dateFrom || dateTo
        ? `${filenamePrefix}${factorySuffix}-${dateFrom || today}-${dateTo || today}.csv`
        : `${filenamePrefix}${factorySuffix}-${today}.csv`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('export/sku-csv')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: '"Right Click SKU" — export selected orders as new-SKU rows for ERP import (interchange_companycode/inventorylocationcode/code/description/vendor_no). Admin/Authorizer only.' })
  async exportSkuCsv(
    @Query('orderIds') orderIdsParam: string,
    @Res() res: Response,
  ) {
    const orderIds = (orderIdsParam || '').split(',').map(s => s.trim()).filter(Boolean);
    const csv = await this.ordersService.exportOrderSkuCsv(orderIds);
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="new-sku-rightclick-${today}.csv"`);
    res.send(csv);
  }

  @Get('export/rightclick-orders-csv')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: '"RightClick Orders" — export selected orders as new-order rows for ERP import (interchange_customer_no/po/order_type/date/... /item/quantity/price). Admin/Authorizer only.' })
  async exportRightClickOrdersCsv(
    @Query('orderIds') orderIdsParam: string,
    @Res() res: Response,
  ) {
    const orderIds = (orderIdsParam || '').split(',').map(s => s.trim()).filter(Boolean);
    const csv = await this.ordersService.exportRightClickOrdersCsv(orderIds);
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rightclick-orders-${today}.csv"`);
    res.send(csv);
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
    return this.ordersService.updateStatus(id, body.status, req.user, body.quotedCost, body.repairContractor, body.customerCode);
  }

  @Patch(':id/reactivate')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Admin only — un-cancels an order, restoring whichever status it was in immediately before cancellation' })
  reactivate(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.reactivateOrder(id, req.user);
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

  @Post(':id/resend-factory-alert')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @RequiresPermission(Permission.ASSIGN_SUPPLIER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Re-send the "order issued to your factory" email for an already-assigned order — recovery lever for when the original send failed silently' })
  resendFactoryAlert(@Param('id') id: string) {
    return this.ordersService.resendFactoryAssignedAlert(id);
  }

  @Post('backfill-cad-approvals')
  @Roles(UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'One-time fix: mark stuck CAD files APPROVED on orders that already advanced past CAD_IN_PROGRESS (Admin-only, safe to re-run)' })
  backfillCadApprovals() {
    return this.ordersService.backfillStuckCadApprovals();
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
