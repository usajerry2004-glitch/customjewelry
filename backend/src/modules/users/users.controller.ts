import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@Roles(UserRole.ADMIN, UserRole.SALES_REP)
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get user stats' })
  stats() {
    return this.usersService.getStats();
  }

  @Get()
  @ApiOperation({ summary: 'List users, optionally filtered by role' })
  findAll(@Query('role') role?: string) {
    return this.usersService.findAll(role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new user account (Admin only)' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user — name, password, active status (Admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'Get all orders for a customer' })
  getOrders(@Param('id') id: string) {
    return this.usersService.getCustomerOrders(id);
  }
}
