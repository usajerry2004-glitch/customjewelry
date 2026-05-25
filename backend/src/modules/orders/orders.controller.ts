import { Controller, Get, Post, Put, Patch, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService, OrderFilterDto } from './orders.service';
import { Order, OrderStatus } from '../../database/entities/order.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

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

  @Get('kanban')
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Kanban board' })
  kanban(@Request() req: any) {
    return this.ordersService.getKanbanBoard(req.user);
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER)
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

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Update order status (Sales/Admin only)' })
  updateStatus(@Param('id') id: string, @Body('status') status: OrderStatus) {
    return this.ordersService.updateStatus(id, status);
  }

  @Patch(':id/authorize')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Authorize order — moves to PENDING_CAD' })
  authorize(@Param('id') id: string) {
    return this.ordersService.authorize(id);
  }
}
