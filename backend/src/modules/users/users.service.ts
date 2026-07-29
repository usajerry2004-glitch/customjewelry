import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { IsString, IsEmail, MinLength, IsNotEmpty, IsOptional, IsEnum, IsBoolean, ValidateIf, IsArray } from 'class-validator';
import { User, UserRole } from '../../database/entities/user.entity';
import { Order, Factory, SupplySource } from '../../database/entities/order.entity';
import { Company } from '../../database/entities/company.entity';
import { Permission } from '../../common/permissions';

// A brand-new Customer invite (no companyId — the invite is what creates the
// company) names the company, not necessarily a specific contact, so the
// person's name becomes optional and the company name becomes required.
// Every other case (staff roles, or a teammate joining an existing company
// via companyId) keeps names required and storeName irrelevant/optional.
const isNewCustomerCompany = (o: { role?: UserRole; companyId?: string }) =>
  (o.role || UserRole.CUSTOMER) === UserRole.CUSTOMER && !o.companyId;

export class CreateUserDto {
  @ValidateIf(o => !isNewCustomerCompany(o)) @IsString() firstName?: string;
  @ValidateIf(o => !isNewCustomerCompany(o)) @IsString() lastName?: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsEnum(UserRole) @IsOptional() role?: UserRole;
  @ValidateIf(o => isNewCustomerCompany(o)) @IsString() @IsNotEmpty() storeName?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() salesRepId?: string;
  @IsEnum(Factory) @IsOptional() assignedFactory?: Factory;
  @IsEnum(SupplySource) @IsOptional() assignedSupplySource?: SupplySource;
  // Admin-only: attach this Customer account to an existing company (a
  // teammate) instead of creating a new standalone company for them.
  @IsString() @IsOptional() companyId?: string;
}

export class InviteUserDto {
  @ValidateIf(o => !isNewCustomerCompany(o)) @IsString() firstName?: string;
  @ValidateIf(o => !isNewCustomerCompany(o)) @IsString() lastName?: string;
  @IsEmail() email: string;
  @IsEnum(UserRole) role: UserRole;
  @ValidateIf(o => isNewCustomerCompany(o)) @IsString() @IsNotEmpty() storeName?: string;
  @IsString() @IsOptional() salesRepId?: string;
  @IsEnum(Factory) @IsOptional() assignedFactory?: Factory;
  @IsEnum(SupplySource) @IsOptional() assignedSupplySource?: SupplySource;
  @IsString() @IsOptional() companyId?: string;
}

export class UpdateUserDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsEnum(UserRole) @IsOptional() role?: UserRole;
  @IsString() @IsOptional() @MinLength(6) password?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsBoolean() @IsOptional() emailNotificationsEnabled?: boolean;
  @IsString() @IsOptional() department?: string;
  @IsString() @IsOptional() storeName?: string;
  @IsString() @IsOptional() salesRepId?: string;
  @IsEnum(Factory) @IsOptional() assignedFactory?: Factory | null;
  @IsEnum(SupplySource) @IsOptional() assignedSupplySource?: SupplySource | null;
  // Admin-only: move an already-existing Customer account into a different
  // (or newly-created) company — e.g. merging two accounts that turned out
  // to be the same business, entered as separate invites.
  @IsString() @IsOptional() companyId?: string;
  // Admin-only: extra capabilities this specific account gets beyond its
  // role — see common/permissions.ts. Additive; never removes role access.
  @IsArray() @IsEnum(Permission, { each: true }) @IsOptional() extraPermissions?: Permission[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
  ) {}

  async findAll(role?: string, caller?: { id: string; role: string }): Promise<User[]> {
    const qb = this.userRepo.createQueryBuilder('u');
    if (role) qb.where('u.role = :role', { role });
    // Sort customers alphabetically; sort staff by creation date
    if (role === UserRole.CUSTOMER) {
      qb.orderBy('u.firstName', 'ASC').addOrderBy('u.lastName', 'ASC');
    } else {
      qb.orderBy('u.createdAt', 'DESC');
    }
    // The Customers page still does its own filtering/dedup-by-company/
    // pagination client-side over the full result, so this isn't true
    // pagination — just a safety ceiling so the query can't grow truly
    // unbounded as the customer list grows. Comfortably above any real
    // customer count today; revisit with real server-side pagination if
    // this is ever actually hit.
    return qb.take(5000).getMany();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, caller?: { id: string; role: string }): Promise<User> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    // A Sales Rep can only ever create Customer accounts — the role they
    // request is ignored, not just hidden by the UI, so this can't be
    // bypassed by calling the API directly.
    const role = caller?.role === UserRole.SALES_REP ? UserRole.CUSTOMER : (dto.role || UserRole.CUSTOMER);

    let salesRepId: string | undefined = caller?.role === UserRole.SALES_REP ? caller.id : dto.salesRepId;
    let company: Company | undefined;

    if (role === UserRole.CUSTOMER) {
      if (dto.companyId) {
        // Adding a teammate to an existing company — one Sales Rep per
        // company, so this is inherited, not chosen, and only Admin can do it.
        if (caller?.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only Admin can add a teammate to an existing company.');
        }
        company = (await this.companyRepo.findOne({ where: { id: dto.companyId } })) ?? undefined;
        if (!company) throw new BadRequestException('Company not found.');
        salesRepId = company.salesRepId || undefined;
      } else {
        if (caller?.role !== UserRole.SALES_REP) {
          if (!salesRepId) throw new BadRequestException('A Sales Rep must be assigned to every customer account.');
          const rep = await this.userRepo.findOne({ where: { id: salesRepId } });
          if (!rep || rep.role !== UserRole.SALES_REP) {
            throw new BadRequestException('salesRepId must reference an existing Sales Rep.');
          }
        }
        company = await this.companyRepo.save(this.companyRepo.create({
          name: dto.storeName?.trim() || `${dto.firstName} ${dto.lastName}`.trim(),
          salesRepId: salesRepId || null,
        }));
      }
    }

    const user = this.userRepo.create({
      firstName: dto.firstName || '',
      lastName: dto.lastName || '',
      email,
      passwordHash,
      role,
      salesRepId,
      companyId: company?.id,
      storeName: company?.name ?? dto.storeName,
      // Not restricted to one role: a Stone Manager account may also be tagged
      // with a factory (e.g. one contact who handles both stones and factory
      // orders for the same outside partner) and still receive factory-side
      // notifications alongside their normal Stone Manager queue.
      assignedFactory: dto.assignedFactory,
      assignedSupplySource: dto.assignedSupplySource,
    });
    return this.userRepo.save(user);
  }

  async update(id: string, dto: UpdateUserDto, caller?: { id: string }): Promise<User> {
    const user = await this.findOne(id);
    if (dto.role !== undefined && dto.role !== user.role && id === caller?.id) {
      throw new BadRequestException('You cannot change your own role');
    }
    if (dto.password) {
      (user as any).passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.emailNotificationsEnabled !== undefined) user.emailNotificationsEnabled = dto.emailNotificationsEnabled;
    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      if (email !== user.email) {
        const existing = await this.userRepo.findOne({ where: { email } });
        if (existing && existing.id !== id) throw new ConflictException('Email already registered');
        user.email = email;
      }
    }
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.department !== undefined) user.department = dto.department;
    if (dto.storeName !== undefined) {
      user.storeName = dto.storeName;
      // Keep the whole company's display name in sync — a Customer with
      // teammates shouldn't show a different company name per person.
      if (user.companyId) {
        await this.companyRepo.update(user.companyId, { name: dto.storeName });
        await this.userRepo.update({ companyId: user.companyId }, { storeName: dto.storeName });
      }
    }
    if (dto.assignedFactory !== undefined) user.assignedFactory = dto.assignedFactory;
    if (dto.assignedSupplySource !== undefined) user.assignedSupplySource = dto.assignedSupplySource;
    if (dto.extraPermissions !== undefined) user.extraPermissions = dto.extraPermissions;
    if (dto.salesRepId !== undefined) {
      if (dto.salesRepId) {
        const rep = await this.userRepo.findOne({ where: { id: dto.salesRepId } });
        if (!rep || rep.role !== UserRole.SALES_REP) {
          throw new BadRequestException('salesRepId must reference an existing Sales Rep.');
        }
      }
      const nextSalesRepId = (dto.salesRepId || null) as any;
      user.salesRepId = nextSalesRepId;
      const repPatch = await this.buildOrderRepPatch(nextSalesRepId);
      // One Sales Rep per company — changing it here changes it for every
      // teammate, and for every order already placed (otherwise their past
      // orders stay attributed to the old rep and silently vanish from the
      // new rep's queue, which only filters by salesRepId).
      if (user.companyId) {
        await this.companyRepo.update(user.companyId, { salesRepId: nextSalesRepId });
        await this.userRepo.update({ companyId: user.companyId }, { salesRepId: nextSalesRepId });
        await this.orderRepo.update({ companyId: user.companyId }, repPatch);
      } else {
        await this.orderRepo.update({ customerId: user.id }, repPatch);
        await this.orderRepo.update({ customerEmail: user.email }, repPatch);
      }
    }
    if (dto.companyId !== undefined) {
      if (dto.companyId) {
        const company = await this.companyRepo.findOne({ where: { id: dto.companyId } });
        if (!company) throw new BadRequestException('Company not found.');
        user.companyId = company.id;
        // Adopt the target company's name and Sales Rep — a merged-in
        // account shouldn't show a different company name or rep than
        // the teammates it just joined.
        user.storeName = company.name;

        // Normally the joining account adopts the company's existing rep.
        // But if the company has none set yet while THIS account already
        // does — e.g. a rep was assigned to them individually before they
        // were ever linked to a company — overwriting it with the company's
        // null would silently strip a real assignment. Instead, backfill
        // upward: the company (and every other teammate/order already in
        // it) adopts this account's rep. This is exactly the gap that left
        // an order invisible to its rep at Crockers Jewelers (C00204): Mark
        // was set on one teammate individually, but the company record
        // itself, every other teammate, and pre-existing company orders
        // never picked it up.
        const resolvedSalesRepId = company.salesRepId || user.salesRepId || null;
        const backfillingCompany = !company.salesRepId && !!resolvedSalesRepId;
        if (backfillingCompany) {
          await this.companyRepo.update(company.id, { salesRepId: resolvedSalesRepId });
          await this.userRepo.update({ companyId: company.id }, { salesRepId: resolvedSalesRepId });
        }
        user.salesRepId = resolvedSalesRepId || undefined;

        // Pull this person's own already-placed orders into the merged
        // company (and onto its Sales Rep) too, or teammates and the rep
        // won't see anything they placed before today's merge.
        const repPatch = await this.buildOrderRepPatch(resolvedSalesRepId);
        const orderPatch = { companyId: company.id, storeName: company.name, ...repPatch };
        await this.orderRepo.update({ customerId: user.id }, orderPatch);
        await this.orderRepo.update({ customerEmail: user.email }, orderPatch);
        // If the company's rep was just backfilled from this account, every
        // other teammate's pre-existing orders need the same patch too —
        // otherwise only this person's own orders would reflect it.
        if (backfillingCompany) {
          await this.orderRepo.update({ companyId: company.id }, repPatch);
        }
      } else {
        user.companyId = null;
      }
    }
    return this.userRepo.save(user);
  }

  // Denormalized rep fields on Order (salesRepId/Name/Email) are written at
  // order-creation time, not joined live — so any time a company or user's
  // Sales Rep changes, existing orders need the same patch or they fall out
  // of that rep's `salesRepId`-filtered queue.
  private async buildOrderRepPatch(salesRepId: string | null | undefined): Promise<Partial<Order>> {
    const rep = salesRepId ? await this.userRepo.findOne({ where: { id: salesRepId } }) : null;
    if (!rep) return { salesRepId: null, salesRepName: null, salesRepEmail: null } as any;
    return {
      salesRepId: rep.id,
      salesRepName: `${rep.firstName} ${rep.lastName}`.trim(),
      salesRepEmail: rep.email,
    };
  }

  async getCustomerOrders(customerId: string): Promise<{ orders: Order[]; total: number }> {
    const user = await this.findOne(customerId);
    if (user.companyId) await this.healCompanyOrders(user.companyId);
    // Companies share order visibility — this shows every teammate's orders,
    // not just the ones this specific person placed. The customerId/email
    // clauses stay as a fallback for orders placed before companies existed.
    const where = user.companyId
      ? [{ companyId: user.companyId }, { customerId }, { customerEmail: user.email }]
      : [{ customerId }, { customerEmail: user.email }];
    const [orders, total] = await this.orderRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
    });
    return { orders, total };
  }

  // Teammates at the same company as this customer (including themselves).
  // Customer accounts that predate the companies feature (bulk-imported
  // before it shipped) still have no companyId — self-heals here instead of
  // needing a one-off migration, since without one "Add a Teammate" has
  // nothing to attach the invite to and silently can't do anything.
  async getCompanyTeammates(customerId: string): Promise<User[]> {
    const user = await this.findOne(customerId);
    if (!user.companyId) {
      const name = user.storeName?.trim() || `${user.firstName} ${user.lastName}`.trim() || user.email;
      const company = await this.companyRepo.save(this.companyRepo.create({ name, salesRepId: user.salesRepId || null }));
      user.companyId = company.id;
      await this.userRepo.save(user);
    }
    await this.healCompanyOrders(user.companyId);
    return this.userRepo.find({ where: { companyId: user.companyId }, order: { createdAt: 'ASC' } });
  }

  // Orders denormalize companyId/storeName/salesRep* at creation time. If two
  // accounts get merged into one company (or a company's rep changes) after
  // orders already exist, those orders keep pointing at the old company/rep
  // until something re-syncs them — otherwise they silently stay invisible
  // to teammates and drop out of the rep's queue. Re-applied every time
  // anyone views this company's team or orders, keyed off each member's own
  // customerId/email rather than the order's (possibly stale) companyId, so
  // it heals regardless of which side of the merge an order was on.
  private async healCompanyOrders(companyId: string): Promise<void> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) return;
    const teammates = await this.userRepo.find({ where: { companyId } });
    if (!teammates.length) return;
    const patch = { companyId: company.id, storeName: company.name, ...(await this.buildOrderRepPatch(company.salesRepId)) };
    // Batched instead of two updates per teammate — this runs on every
    // customer order-list view and every "Team" panel open, so a company
    // with N teammates was previously 2N sequential round trips to Postgres
    // before the actual read query could even run.
    await this.orderRepo.update({ customerId: In(teammates.map(t => t.id)) }, patch);
    const teammateEmails = teammates.map(t => t.email).filter(Boolean);
    if (teammateEmails.length) {
      await this.orderRepo.update({ customerEmail: In(teammateEmails) }, patch);
    }
  }

  // One-off admin tool: folds every company whose name is a case/whitespace-
  // insensitive duplicate of another's into a single company, moving every
  // teammate and their already-placed orders onto the surviving record.
  // Dry-run unless apply=true. A group is left for manual review when its
  // companies disagree on which Sales Rep is assigned (silently picking one
  // could misattribute a rep's book of business), or when it's the
  // "Kira Jewels" name, which looks like internal/test accounts.
  async mergeDuplicateCompanies(apply: boolean): Promise<{ merged: string[]; skipped: string[] }> {
    const merged: string[] = [];
    const skipped: string[] = [];

    const groups = new Map<string, Company[]>();
    for (const co of await this.companyRepo.find()) {
      const key = co.name.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(co);
    }

    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      if (key === 'kira jewels') {
        skipped.push(`"${key}" (${group.length} companies) — internal/test accounts, review manually`);
        continue;
      }
      const repIds = [...new Set(group.map(g => g.salesRepId).filter(Boolean))];
      if (repIds.length > 1) {
        skipped.push(`"${group[0].name}" (${group.length} companies) — different Sales Reps assigned, review manually`);
        continue;
      }

      group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const primary = group.find(g => g.salesRepId) || group[0];
      const secondaries = group.filter(g => g.id !== primary.id);
      const repPatch = await this.buildOrderRepPatch(primary.salesRepId);

      const moves: string[] = [];
      for (const sec of secondaries) {
        const users = await this.userRepo.find({ where: { companyId: sec.id } });
        moves.push(`${users.length} account(s): ${users.map(u => u.email).join(', ') || '(none)'}`);
        if (apply) {
          await this.userRepo.update({ companyId: sec.id }, { companyId: primary.id, storeName: primary.name, salesRepId: repPatch.salesRepId as any });
          for (const u of users) {
            await this.orderRepo.update({ customerId: u.id }, { companyId: primary.id, storeName: primary.name, ...repPatch });
            await this.orderRepo.update({ customerEmail: u.email }, { companyId: primary.id, storeName: primary.name, ...repPatch });
          }
          await this.companyRepo.delete(sec.id);
        }
      }
      merged.push(`"${primary.name}" — kept ${primary.id}, folded in ${secondaries.map(s => s.id).join(', ')} (${moves.join('; ')})`);
    }

    return { merged, skipped };
  }

  // Read-only diagnostic: groups CUSTOMER accounts by the same display name
  // the Customers page shows (storeName, falling back to the person's name)
  // rather than by the companies table — this also catches accounts that
  // predate the companies feature and were never linked into a Company row
  // at all, which mergeDuplicateCompanies() can't see since it only scans
  // existing Company records.
  async findDuplicateDisplayNames(): Promise<{ name: string; members: { id: string; email: string; companyId: string | null; salesRepId: string | null }[] }[]> {
    const customers = await this.userRepo.find({ where: { role: UserRole.CUSTOMER } });
    const groups = new Map<string, User[]>();
    for (const u of customers) {
      const name = (u.storeName?.trim() || `${u.firstName} ${u.lastName}`.trim() || u.email).toLowerCase();
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(u);
    }
    const result: { name: string; members: { id: string; email: string; companyId: string | null; salesRepId: string | null }[] }[] = [];
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      result.push({
        name: members[0].storeName?.trim() || `${members[0].firstName} ${members[0].lastName}`.trim(),
        members: members.map(m => ({ id: m.id, email: m.email, companyId: m.companyId, salesRepId: m.salesRepId })),
      });
    }
    return result;
  }

  // Read-only diagnostic for the drift that left order C00204 invisible to
  // its rep at Crockers Jewelers: a company whose own salesRepId is null (or
  // disagrees) while one of its teammates carries a rep individually. Flags
  // every company where that's currently true, with a suggested fix when
  // there's exactly one candidate rep among the teammates, plus a count of
  // that company's orders not already stamped with the suggested rep — so
  // impact is visible before anyone applies a fix. Never writes anything.
  async findCompanyRepDrift(): Promise<{
    companyId: string;
    companyName: string;
    companySalesRepId: string | null;
    teammates: { id: string; email: string; salesRepId: string | null }[];
    suggestedSalesRepId: string | null;
    affectedOrderCount: number | null;
  }[]> {
    const companies = await this.companyRepo.find();
    const results: Awaited<ReturnType<UsersService['findCompanyRepDrift']>> = [];

    for (const company of companies) {
      const teammates = await this.userRepo.find({ where: { companyId: company.id } });
      const distinctRepIds = [...new Set(teammates.map(t => t.salesRepId).filter((v): v is string => !!v))];

      const disagreesWithCompany = company.salesRepId
        ? distinctRepIds.some(id => id !== company.salesRepId)
        : distinctRepIds.length > 0;
      if (!disagreesWithCompany) continue;

      const suggestedSalesRepId = !company.salesRepId && distinctRepIds.length === 1 ? distinctRepIds[0] : null;
      let affectedOrderCount: number | null = null;
      if (suggestedSalesRepId) {
        const companyOrders = await this.orderRepo.find({ where: { companyId: company.id }, select: ['salesRepId'] });
        affectedOrderCount = companyOrders.filter(o => o.salesRepId !== suggestedSalesRepId).length;
      }

      results.push({
        companyId: company.id,
        companyName: company.name,
        companySalesRepId: company.salesRepId,
        teammates: teammates.map(t => ({ id: t.id, email: t.email, salesRepId: t.salesRepId })),
        suggestedSalesRepId,
        affectedOrderCount,
      });
    }
    return results;
  }

  // Companion to mergeDuplicateCompanies(): handles the accounts that method
  // can't see because they were never linked to a Company row at all — two+
  // Customer accounts that just happen to carry the same display name text.
  // Groups them onto a shared company (creating one if none of them has one
  // yet, otherwise adopting whichever one already does), cascading to their
  // orders. Same skip rules: "Kira Jewels" and Sales Rep disagreements are
  // left for manual review. Dry-run unless apply=true.
  async mergeDuplicateDisplayNames(apply: boolean): Promise<{ merged: string[]; skipped: string[] }> {
    const merged: string[] = [];
    const skipped: string[] = [];

    const customers = await this.userRepo.find({ where: { role: UserRole.CUSTOMER } });
    const groups = new Map<string, User[]>();
    for (const u of customers) {
      const key = (u.storeName?.trim() || `${u.firstName} ${u.lastName}`.trim() || u.email).toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(u);
    }

    for (const [key, members] of groups) {
      if (members.length < 2) continue;
      const displayName = members[0].storeName?.trim() || `${members[0].firstName} ${members[0].lastName}`.trim();

      if (key === 'kira jewels') {
        skipped.push(`"${displayName}" (${members.length} accounts) — internal/test accounts, review manually`);
        continue;
      }

      // mergeDuplicateCompanies() already handles members that already share
      // a Company row — only act on the ones still standing alone here.
      const loose = members.filter(m => !m.companyId);
      if (loose.length < 2) continue;

      const linkedElsewhere = members.find(m => m.companyId);
      const existingCompany = linkedElsewhere ? await this.companyRepo.findOne({ where: { id: linkedElsewhere.companyId! } }) : null;

      let salesRepId: string | null;
      if (existingCompany) {
        salesRepId = existingCompany.salesRepId;
      } else {
        const repIds = [...new Set(loose.map(m => m.salesRepId).filter(Boolean))];
        if (repIds.length > 1) {
          skipped.push(`"${displayName}" (${loose.length} accounts) — different Sales Reps assigned, review manually`);
          continue;
        }
        salesRepId = repIds[0] || null;
      }
      const repPatch = await this.buildOrderRepPatch(salesRepId);

      merged.push(
        existingCompany
          ? `"${displayName}" — linking ${loose.length} account(s) into existing company ${existingCompany.id} (${loose.map(m => m.email).join(', ')})`
          : `"${displayName}" — new company for ${loose.length} account(s) (${loose.map(m => m.email).join(', ')})`,
      );

      if (apply) {
        const company = existingCompany || await this.companyRepo.save(this.companyRepo.create({ name: displayName, salesRepId }));
        for (const m of loose) {
          await this.userRepo.update(m.id, { companyId: company.id, storeName: company.name, salesRepId: salesRepId as any });
          await this.orderRepo.update({ customerId: m.id }, { companyId: company.id, storeName: company.name, ...repPatch });
          await this.orderRepo.update({ customerEmail: m.email }, { companyId: company.id, storeName: company.name, ...repPatch });
        }
      }
    }

    return { merged, skipped };
  }

  // One-off admin tool for the cases mergeDuplicateCompanies()/
  // mergeDuplicateDisplayNames() correctly refused to guess at — groups
  // whose accounts disagree on Sales Rep. Takes an explicit, human-decided
  // list of {emails, salesRepId} groups: finds the accounts by email,
  // merges them onto whichever of them already has a Company (adopting the
  // chosen rep there too — lets e.g. two already-separately-merged
  // companies for the same real business be folded into one), or creates a
  // fresh company if none of them has one yet. Cascades to orders.
  async resolveDuplicateGroups(
    groups: { emails: string[]; salesRepId?: string | null; companyName?: string }[],
  ): Promise<{ resolved: string[] }> {
    const resolved: string[] = [];

    for (const g of groups) {
      const emails = g.emails.map(e => e.toLowerCase().trim());
      // Some legacy accounts still have their original mixed/upper-case
      // email stored as-is — match case-insensitively, not with In().
      const users = await this.userRepo.createQueryBuilder('u')
        .where('LOWER(u.email) IN (:...emails)', { emails })
        .getMany();
      if (users.length < 2) {
        resolved.push(`SKIPPED (${g.emails.join(', ')}) — only found ${users.length} matching account(s), need at least 2`);
        continue;
      }
      if (g.salesRepId) {
        const rep = await this.userRepo.findOne({ where: { id: g.salesRepId } });
        if (!rep || rep.role !== UserRole.SALES_REP) {
          resolved.push(`SKIPPED (${g.emails.join(', ')}) — salesRepId does not reference an existing Sales Rep`);
          continue;
        }
      }

      const linkedElsewhere = users.find(u => u.companyId);
      const existingCompany = linkedElsewhere ? await this.companyRepo.findOne({ where: { id: linkedElsewhere.companyId! } }) : null;

      const nextSalesRepId = (g.salesRepId ?? existingCompany?.salesRepId ?? null) as any;
      const company = existingCompany
        ? await this.companyRepo.save({ ...existingCompany, salesRepId: nextSalesRepId })
        : await this.companyRepo.save(this.companyRepo.create({
            name: g.companyName?.trim() || users[0].storeName?.trim() || `${users[0].firstName} ${users[0].lastName}`.trim(),
            salesRepId: nextSalesRepId,
          }));

      const repPatch = await this.buildOrderRepPatch(company.salesRepId);
      for (const u of users) {
        await this.userRepo.update(u.id, { companyId: company.id, storeName: company.name, salesRepId: company.salesRepId as any });
        await this.orderRepo.update({ customerId: u.id }, { companyId: company.id, storeName: company.name, ...repPatch });
        await this.orderRepo.update({ customerEmail: u.email }, { companyId: company.id, storeName: company.name, ...repPatch });
      }
      resolved.push(`"${company.name}" — ${users.length} account(s) merged onto company ${company.id} with rep ${company.salesRepId || '(none)'}`);
    }

    return { resolved };
  }

  async togglePriority(id: string): Promise<User> {
    const user = await this.findOne(id);
    user.isPriority = !user.isPriority;
    await this.userRepo.save(user);
    // Sync isPriorityCustomer on all orders for this customer
    await this.orderRepo.update(
      { customerId: id },
      { isPriorityCustomer: user.isPriority },
    );
    return user;
  }

  async inviteStaff(dto: InviteUserDto, caller?: { id: string; role: string }): Promise<{ user: User; tempPassword: string }> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const rand = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const tempPassword = `KiRa-${rand(4)}-${rand(4)}`;
    const user = await this.create({ ...dto, password: tempPassword }, caller);
    return { user, tempPassword };
  }

  async remove(id: string, callerId: string): Promise<void> {
    if (id === callerId) throw new BadRequestException('You cannot remove your own account');
    const user = await this.findOne(id);
    await this.userRepo.remove(user);
  }

  async getStats(): Promise<{ totalCustomers: number; activeCustomers: number; totalStaff: number }> {
    const totalCustomers = await this.userRepo.count({ where: { role: UserRole.CUSTOMER } });
    const activeCustomers = await this.userRepo.count({ where: { role: UserRole.CUSTOMER, isActive: true } });
    const totalStaff = await this.userRepo.count();
    return { totalCustomers, activeCustomers, totalStaff };
  }
}
