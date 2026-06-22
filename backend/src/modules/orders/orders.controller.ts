import { Controller, Get, Post, Put, Patch, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';
import { OrdersService, OrderFilterDto } from './orders.service';
import { Order } from '../../database/entities/order.entity';
import { UpdateStatusDto } from './update-status.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

class BulkStatusDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  orderIds: string[];

  @IsString()
  status: string;
}

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
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
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.SKU_MANAGER, UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Kanban board' })
  kanban(@Request() req: any) {
    return this.ordersService.getKanbanBoard(req.user);
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.SKU_MANAGER, UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER)
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
  @Roles(UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Bulk mark orders as Manufactured (Factory Manager only)' })
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

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.SKU_MANAGER, UserRole.FACTORY_MANAGER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Update order status (quotedCost required when moving to SKU_CREATION)' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
    @Request() req: any,
  ) {
    return this.ordersService.updateStatus(id, body.status, req.user, body.quotedCost, body.repairContractor);
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
}
