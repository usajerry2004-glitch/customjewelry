import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
@Roles(UserRole.ADMIN, UserRole.SALES_REP, UserRole.AUTHORIZER, UserRole.CAD_DESIGNER, UserRole.FACTORY_MANAGER, UserRole.STONE_MANAGER)
@UseGuards(RolesGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Global cross-entity search across orders, customers, and companies' })
  search(@Query('q') q: string, @Request() req: any) {
    return this.searchService.search(q, req.user);
  }
}
