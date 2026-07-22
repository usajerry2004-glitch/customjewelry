import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { UsersService, CreateUserDto, UpdateUserDto, InviteUserDto } from './users.service';
import { EmailService } from '../email/email.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER)
@UseGuards(RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get user stats' })
  stats() {
    return this.usersService.getStats();
  }

  @Get()
  @ApiOperation({ summary: 'List users, optionally filtered by role' })
  findAll(@Query('role') role?: string, @CurrentUser() caller?: any) {
    return this.usersService.findAll(role, caller);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES_REP)
  @ApiOperation({ summary: 'Create a new user account (Admin or Sales Rep)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() caller?: any) {
    return this.usersService.create(dto, caller);
  }

  @Post('invite')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Invite a new staff member (or a Customer teammate) — auto-generates temp password and sends email' })
  async inviteStaff(@Body() dto: InviteUserDto, @CurrentUser() caller?: any) {
    const { user, tempPassword } = await this.usersService.inviteStaff(dto, caller);
    await this.emailService.sendStaffInvite({
      to: user.email,
      firstName: user.firstName || user.storeName || 'there',
      role: user.role,
      tempPassword,
    });
    return user;
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user — name, email, role, password, active status (Admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() caller?: any) {
    return this.usersService.update(id, dto, caller);
  }

  @Patch(':id/priority')
  @Roles(UserRole.ADMIN, UserRole.AUTHORIZER)
  @ApiOperation({ summary: 'Toggle customer priority status (Admin/Authorizer)' })
  togglePriority(@Param('id') id: string) {
    return this.usersService.togglePriority(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove a user (Admin only). Cannot remove yourself.' })
  remove(@Param('id') id: string, @CurrentUser() caller: any) {
    return this.usersService.remove(id, caller.id);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'Get all orders for a customer (includes teammates\' orders at the same company)' })
  getOrders(@Param('id') id: string) {
    return this.usersService.getCustomerOrders(id);
  }

  @Get(':id/teammates')
  @ApiOperation({ summary: "Get every user at this customer's company (including themselves)" })
  getTeammates(@Param('id') id: string) {
    return this.usersService.getCompanyTeammates(id);
  }

  @Post('admin/merge-duplicate-companies')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'One-off: merge companies sharing the same name, cascading to teammates and orders. Dry-run unless ?apply=true.' })
  mergeDuplicateCompanies(@Query('apply') apply?: string) {
    return this.usersService.mergeDuplicateCompanies(apply === 'true');
  }

  @Post('admin/merge-duplicate-display-names')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'One-off: merge Customers sharing the same display name but never linked to a Company row. Dry-run unless ?apply=true.' })
  mergeDuplicateDisplayNames(@Query('apply') apply?: string) {
    return this.usersService.mergeDuplicateDisplayNames(apply === 'true');
  }

  @Get('admin/duplicate-display-names')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Read-only: groups Customers by their displayed name (storeName or person name), including accounts never linked to a Company row.' })
  findDuplicateDisplayNames() {
    return this.usersService.findDuplicateDisplayNames();
  }

  @Post('admin/resolve-duplicate-groups')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'One-off: merge specific named groups of accounts (by email) onto a shared company with a chosen Sales Rep — for cases the automatic merges skipped over a rep disagreement.' })
  resolveDuplicateGroups(@Body() body: { groups: { emails: string[]; salesRepId?: string; companyName?: string }[] }) {
    return this.usersService.resolveDuplicateGroups(body.groups);
  }
}
